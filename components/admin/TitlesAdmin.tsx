"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { UserRole } from "@/lib/database.types";
import { Icon } from "@/components/shell/Icon";

export interface MinistryTitle {
  id: string;
  name: string;
  role: UserRole | null;
  sort_order: number;
}

const ROLES: UserRole[] = ["Super_Admin", "Admin", "IT_Admin", "Staff", "Volunteer", "Member"];

const ROLE_LABEL: Record<string, string> = {
  Super_Admin: "Super Admin",
  Admin: "Admin (Apostle / Pastor)",
  IT_Admin: "IT Admin",
  Staff: "Staff",
  Volunteer: "Volunteer",
  Member: "Member",
};

/**
 * The titles the church uses, and what access each one implies.
 *
 * A title with a role attached OFFERS that role when it is assigned in
 * Admin → People — it is never applied silently. Someone picking a word from a
 * dropdown should not change what another person can reach without being told.
 */
export function TitlesAdmin({ initial }: { initial: MinistryTitle[] }) {
  const supabase = createClient();
  const [titles, setTitles] = useState<MinistryTitle[]>(initial);
  const [name, setName] = useState("");
  const [role, setRole] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    const clean = name.trim();
    if (!clean) return;
    setBusy(true);
    setError(null);
    const { data, error } = await supabase
      .from("ministry_titles")
      .insert({
        name: clean,
        role: role || null,
        sort_order: (titles.at(-1)?.sort_order ?? 100) + 10,
      })
      .select("id, name, role, sort_order")
      .single();
    setBusy(false);
    if (error) {
      setError(
        /duplicate|unique/i.test(error.message)
          ? `"${clean}" already exists.`
          : error.message,
      );
      return;
    }
    setTitles((t) => [...t, data as MinistryTitle]);
    setName("");
    setRole("");
  }

  async function setTitleRole(id: string, value: string) {
    const next = (value || null) as UserRole | null;
    const previous = titles.find((t) => t.id === id)?.role ?? null;
    setError(null);
    setTitles((ts) => ts.map((t) => (t.id === id ? { ...t, role: next } : t)));
    const { data, error } = await supabase
      .from("ministry_titles")
      .update({ role: next })
      .eq("id", id)
      .select("id");
    // RLS refusing a row returns no rows and no error.
    if (error || !data?.length) {
      setTitles((ts) => ts.map((t) => (t.id === id ? { ...t, role: previous } : t)));
      setError(error?.message ?? "Only a super admin can change what a title grants.");
    }
  }

  async function rename(t: MinistryTitle) {
    const next = window.prompt("Rename title", t.name);
    if (!next || next.trim() === t.name) return;
    setError(null);
    const { data, error } = await supabase
      .from("ministry_titles")
      .update({ name: next.trim() })
      .eq("id", t.id)
      .select("id");
    if (error || !data?.length) {
      setError(error?.message ?? "Couldn't rename that.");
      return;
    }
    setTitles((ts) => ts.map((x) => (x.id === t.id ? { ...x, name: next.trim() } : x)));
  }

  async function remove(t: MinistryTitle) {
    if (
      !window.confirm(
        `Delete the title "${t.name}"?\n\nAnyone already carrying it keeps it — titles are stored on the person, so this only removes it from the list of choices.`,
      )
    )
      return;
    setError(null);
    setTitles((ts) => ts.filter((x) => x.id !== t.id));
    const { error } = await supabase.from("ministry_titles").delete().eq("id", t.id);
    if (error) {
      setError(error.message);
      setTitles((ts) => [...ts, t].sort((a, b) => a.sort_order - b.sort_order));
    }
  }

  return (
    <div>
      <p className="mb-4 rounded-lg bg-ink-50 px-3 py-2 text-sm text-ink-600">
        What people are called, and what each title implies. Give a title an
        access level and assigning it in <strong>People</strong> will offer that
        level too — you still confirm it, so a title never changes someone&apos;s
        access on its own. Leave it blank for a title that is just a label.
      </p>

      <form onSubmit={add} className="mb-6 space-y-3 rounded-xl border border-ink-100 bg-white p-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-ink-600">New title</span>
            <input
              className="ah-input"
              placeholder="e.g. Children's Director"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-ink-600">Access it implies</span>
            <select className="ah-input" value={role} onChange={(e) => setRole(e.target.value)}>
              <option value="">Just a label — no access</option>
              {ROLES.map((r) => (
                <option key={r} value={r}>{ROLE_LABEL[r]}</option>
              ))}
            </select>
          </label>
        </div>
        <button
          type="submit"
          disabled={busy || !name.trim()}
          className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-onaccent hover:bg-accent-strong disabled:opacity-60"
        >
          {busy ? "Adding…" : "Add title"}
        </button>
      </form>

      {error && (
        <p className="mb-4 rounded-lg bg-brand-50 px-3 py-2 text-sm text-brand-700">{error}</p>
      )}

      <div className="space-y-2">
        {titles.map((t) => (
          <div
            key={t.id}
            className="flex flex-wrap items-center gap-3 rounded-xl border border-ink-100 bg-white p-3"
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
              <Icon name="badge" size={18} />
            </span>
            <span className="min-w-0 flex-1 font-medium text-ink-900">{t.name}</span>
            <label className="flex items-center gap-1.5 text-xs text-ink-500">
              Grants
              <select
                className="ah-input w-auto py-1 text-sm"
                value={t.role ?? ""}
                onChange={(e) => setTitleRole(t.id, e.target.value)}
              >
                <option value="">nothing</option>
                {ROLES.map((r) => (
                  <option key={r} value={r}>{ROLE_LABEL[r]}</option>
                ))}
              </select>
            </label>
            <button
              onClick={() => rename(t)}
              className="rounded-lg px-2.5 py-1.5 text-sm font-medium text-ink-600 hover:bg-ink-50"
            >
              Rename
            </button>
            <button
              onClick={() => remove(t)}
              className="rounded-lg px-2.5 py-1.5 text-sm font-medium text-brand-600 hover:bg-brand-50"
            >
              Delete
            </button>
          </div>
        ))}
        {titles.length === 0 && (
          <p className="rounded-xl border border-dashed border-ink-200 px-4 py-10 text-center text-sm text-ink-400">
            No titles yet — add one above.
          </p>
        )}
      </div>
    </div>
  );
}
