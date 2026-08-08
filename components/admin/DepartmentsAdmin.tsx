"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Department } from "@/lib/database.types";
import { Icon } from "@/components/shell/Icon";

function slugify(name: string) {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

export function DepartmentsAdmin({
  initial,
  counts,
}: {
  initial: Department[];
  counts: Record<string, number>;
}) {
  const supabase = createClient();
  const [depts, setDepts] = useState<Department[]>(initial);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function addDept(e: React.FormEvent) {
    e.preventDefault();
    const clean = name.trim();
    if (!clean) return;
    setBusy(true);
    setError(null);
    // The insert fires the trigger that auto-creates the department's group chat.
    const { data, error } = await supabase
      .from("departments")
      .insert({ name: clean, slug: slugify(clean) })
      .select("*")
      .single();
    setBusy(false);
    if (error) {
      setError(error.message);
      return;
    }
    setDepts((d) => [...d, data as Department].sort((a, b) => a.name.localeCompare(b.name)));
    setName("");
  }

  async function rename(id: string, current: string) {
    const next = window.prompt("Rename department", current);
    if (!next || next.trim() === current) return;
    const { error } = await supabase
      .from("departments")
      .update({ name: next.trim() })
      .eq("id", id);
    if (error) return setError(error.message);
    setDepts((d) => d.map((x) => (x.id === id ? { ...x, name: next.trim() } : x)));
  }

  async function remove(id: string, dname: string) {
    if (
      !window.confirm(
        `Delete "${dname}"? This removes its group chat and all memberships. This cannot be undone.`,
      )
    )
      return;
    const { error } = await supabase.from("departments").delete().eq("id", id);
    if (error) return setError(error.message);
    setDepts((d) => d.filter((x) => x.id !== id));
  }

  return (
    <div>
      <form onSubmit={addDept} className="mb-6 flex gap-2">
        <input
          className="ah-input"
          placeholder="New department name (e.g. Hospitality)"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <button
          type="submit"
          disabled={busy}
          className="shrink-0 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-onaccent hover:bg-accent-strong disabled:opacity-60"
        >
          Add
        </button>
      </form>

      {error && (
        <p className="mb-4 rounded-lg bg-brand-50 px-3 py-2 text-sm text-brand-700">
          {error}
        </p>
      )}

      <div className="overflow-hidden rounded-xl border border-ink-100 bg-white">
        {depts.map((d) => (
          <div
            key={d.id}
            className="flex items-center gap-3 border-b border-ink-100 px-4 py-3 last:border-0"
          >
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-50 text-brand-500">
              <Icon name="group" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="font-medium text-ink-900">{d.name}</p>
              <p className="text-xs text-ink-400">
                {counts[d.id] ?? 0} member{(counts[d.id] ?? 0) === 1 ? "" : "s"} ·
                auto group chat
              </p>
            </div>
            <button
              onClick={() => rename(d.id, d.name)}
              className="rounded-lg px-2.5 py-1.5 text-sm font-medium text-ink-600 hover:bg-ink-50"
            >
              Rename
            </button>
            <button
              onClick={() => remove(d.id, d.name)}
              className="rounded-lg px-2.5 py-1.5 text-sm font-medium text-brand-600 hover:bg-brand-50"
            >
              Delete
            </button>
          </div>
        ))}
        {depts.length === 0 && (
          <p className="px-4 py-6 text-center text-sm text-ink-400">
            No departments yet — add one above.
          </p>
        )}
      </div>
    </div>
  );
}
