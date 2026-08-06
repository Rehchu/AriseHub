"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Campus, Department, UserRole } from "@/lib/database.types";
import { Icon } from "@/components/shell/Icon";

const ROLES: UserRole[] = ["Member", "Volunteer", "Staff", "IT_Admin", "Super_Admin"];

export function InvitePanel({
  departments,
  campuses,
}: {
  departments: Department[];
  campuses: Campus[];
}) {
  const supabase = createClient();
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<UserRole>("Member");
  const [campusId, setCampusId] = useState("");
  const [deptIds, setDeptIds] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [link, setLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  function toggle(id: string) {
    setDeptIds((s) => {
      const next = new Set(s);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  async function invite(e: React.FormEvent) {
    e.preventDefault();
    const clean = email.trim().toLowerCase();
    if (!clean) return;
    setBusy(true);
    setError(null);
    setLink(null);

    // Opaque token for the link (acceptance is by email-match on signup — the
    // handle_new_auth_user trigger consumes the matching pending invitation).
    const token = crypto.randomUUID().replace(/-/g, "");
    const { data, error } = await supabase
      .from("invitations")
      .insert({
        email: clean,
        role,
        campus_id: campusId || null,
        token,
      })
      .select("id")
      .single();

    if (error || !data) {
      setBusy(false);
      setError(error?.message ?? "Could not create invitation.");
      return;
    }

    if (deptIds.size) {
      const rows = [...deptIds].map((department_id) => ({
        invitation_id: (data as { id: string }).id,
        department_id,
      }));
      const { error: dErr } = await supabase
        .from("invitation_departments")
        .insert(rows);
      if (dErr) setError(`Invite created, but departments failed: ${dErr.message}`);
    }

    setBusy(false);
    setLink(`${window.location.origin}/login?invite=${token}`);
    setEmail("");
    setRole("Member");
    setCampusId("");
    setDeptIds(new Set());
  }

  return (
    <div className="rounded-xl border border-ink-100 bg-white">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between px-4 py-3 text-left"
      >
        <span className="flex items-center gap-2 font-medium text-ink-900">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-500 text-white">
            <Icon name="users" size={18} />
          </span>
          Invite someone
        </span>
        <span className="text-ink-400">{open ? "–" : "+"}</span>
      </button>

      {open && (
        <form onSubmit={invite} className="space-y-4 border-t border-ink-100 p-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="block sm:col-span-1">
              <span className="mb-1 block text-sm font-medium text-ink-600">Email</span>
              <input
                type="email"
                className="ah-input"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-ink-600">Role</span>
              <select
                className="ah-input"
                value={role}
                onChange={(e) => setRole(e.target.value as UserRole)}
              >
                {ROLES.map((r) => (
                  <option key={r} value={r}>
                    {r.replace("_", " ")}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-ink-600">Campus</span>
              <select
                className="ah-input"
                value={campusId}
                onChange={(e) => setCampusId(e.target.value)}
              >
                <option value="">No campus</option>
                {campuses.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div>
            <span className="mb-1 block text-sm font-medium text-ink-600">
              Departments (they&apos;ll join these group chats on signup)
            </span>
            <div className="flex flex-wrap gap-2">
              {departments.map((d) => {
                const on = deptIds.has(d.id);
                return (
                  <button
                    type="button"
                    key={d.id}
                    onClick={() => toggle(d.id)}
                    className={`rounded-full px-3 py-1 text-sm transition ${
                      on
                        ? "bg-brand-500 text-white"
                        : "bg-white text-ink-600 ring-1 ring-ink-200 hover:bg-ink-50"
                    }`}
                  >
                    {d.name}
                  </button>
                );
              })}
            </div>
          </div>

          {error && (
            <p className="rounded-lg bg-brand-50 px-3 py-2 text-sm text-brand-700">
              {error}
            </p>
          )}

          {link ? (
            <div className="rounded-lg bg-emerald-50 p-3">
              <p className="mb-2 text-sm font-medium text-emerald-800">
                Invitation created. Send this link — they sign up with the invited
                email and automatically get the role + departments.
              </p>
              <div className="flex gap-2">
                <input readOnly className="ah-input text-xs" value={link} />
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(link);
                    setCopied(true);
                    setTimeout(() => setCopied(false), 1500);
                  }}
                  className="shrink-0 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-medium text-white"
                >
                  {copied ? "Copied" : "Copy"}
                </button>
              </div>
            </div>
          ) : (
            <button
              type="submit"
              disabled={busy}
              className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-60"
            >
              {busy ? "Creating…" : "Create invitation"}
            </button>
          )}
        </form>
      )}
    </div>
  );
}
