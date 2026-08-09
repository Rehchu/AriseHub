"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Campus, Department, UserRole } from "@/lib/database.types";
import { Icon } from "@/components/shell/Icon";

const ROLES: UserRole[] = ["Member", "Volunteer", "Staff", "IT_Admin", "Admin", "Super_Admin"];

interface InviteLink {
  id: string;
  code: string;
  label: string;
  role: UserRole;
  campus_id: string | null;
  department_ids: string[];
  active: boolean;
  expires_at: string | null;
  max_uses: number | null;
  uses: number;
}

// Readable, unambiguous code — no O/0, I/1 to avoid mis-typing off a printout.
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
function makeCode(len = 10) {
  const buf = new Uint32Array(len);
  crypto.getRandomValues(buf);
  return [...buf].map((n) => ALPHABET[n % ALPHABET.length]).join("");
}

/**
 * Shareable invite links. Public signup is off, so this is how people join:
 * an admin creates a link carrying a role/campus/departments, shares it, and
 * anyone with it registers themselves. Links can expire, cap uses, and be
 * switched off — the code is a bearer secret.
 */
export function InvitePanel({
  departments,
  campuses,
  createdBy,
  isSuperAdmin = true,
  defaultOpen = false,
}: {
  departments: Department[];
  campuses: Campus[];
  /** Stamped onto the row — the RLS policy for department leads is written
   *  against it, so a lead's insert fails without it (0034). */
  createdBy?: string;
  /** Leads may only invite at Member or Volunteer. */
  isSuperAdmin?: boolean;
  defaultOpen?: boolean;
}) {
  const supabase = createClient();
  const [open, setOpen] = useState(defaultOpen);
  const [links, setLinks] = useState<InviteLink[]>([]);
  const [label, setLabel] = useState("");
  const [role, setRole] = useState<UserRole>("Member");
  // RLS caps a department lead at these two; offering more would just error.
  const allowedRoles = isSuperAdmin ? ROLES : (["Member", "Volunteer"] as UserRole[]);
  const [campusId, setCampusId] = useState("");
  const [deptIds, setDeptIds] = useState<Set<string>>(
    // One department to lead? Preselect it — the choice is not a choice.
    () => new Set(!isSuperAdmin && departments.length === 1 ? [departments[0].id] : []),
  );
  // Links are bearer secrets — default to expiring tomorrow.
  const [expires, setExpires] = useState(() => {
    const d = new Date(Date.now() + 24 * 60 * 60 * 1000);
    return d.toISOString().slice(0, 10);
  });
  const [maxUses, setMaxUses] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    supabase
      .from("invite_links")
      .select("id, code, label, role, campus_id, department_ids, active, expires_at, max_uses, uses")
      .order("created_at", { ascending: false })
      .then(({ data }) => setLinks((data ?? []) as InviteLink[]));
  }, [open, supabase]);

  function toggle(id: string) {
    setDeptIds((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  // Origin is resolved after mount, not during render. Branching on
  // `typeof window` inside render makes the server emit one string and the
  // client another, which is a hydration mismatch — React discards the server
  // markup for that subtree and warns in the console.
  const [origin, setOrigin] = useState("");
  useEffect(() => setOrigin(window.location.origin), []);
  const urlFor = (code: string) => `${origin}/join/${code}`;

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { data, error } = await supabase
      .from("invite_links")
      .insert({
        code: makeCode(),
        ...(createdBy ? { created_by: createdBy } : {}),
        label: label.trim() || "General invite",
        role,
        campus_id: campusId || null,
        department_ids: [...deptIds],
        expires_at: expires
          ? new Date(expires + "T23:59:59").toISOString()
          : new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        max_uses: maxUses ? Number(maxUses) : null,
      })
      .select("id, code, label, role, campus_id, department_ids, active, expires_at, max_uses, uses")
      .single();
    setBusy(false);
    if (error) return setError(error.message);
    setLinks((ls) => [data as InviteLink, ...ls]);
    setLabel("");
    setDeptIds(new Set());
    setExpires("");
    setMaxUses("");
  }

  async function toggleActive(l: InviteLink) {
    setLinks((ls) => ls.map((x) => (x.id === l.id ? { ...x, active: !x.active } : x)));
    await supabase.from("invite_links").update({ active: !l.active }).eq("id", l.id);
  }

  async function remove(id: string) {
    if (!window.confirm("Delete this invite link? Anyone still holding it won't be able to join.")) return;
    setLinks((ls) => ls.filter((x) => x.id !== id));
    await supabase.from("invite_links").delete().eq("id", id);
  }

  return (
    <div className="rounded-xl border border-ink-100 bg-white">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between px-4 py-3 text-left"
      >
        <span className="flex items-center gap-2 font-medium text-ink-900">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent text-onaccent">
            <Icon name="link" size={18} />
          </span>
          Invite links
        </span>
        <span className="text-ink-400">{open ? "–" : "+"}</span>
      </button>

      {open && (
        <div className="border-t border-ink-100 p-4">
          <p className="mb-4 rounded-lg bg-ink-50 px-3 py-2 text-xs text-ink-600">
            Share a link and people register themselves — they arrive with the role,
            campus and departments you set here. Anyone holding the link can join, so
            links expire after 24 hours by default — extend the date only if you
            genuinely need longer, and switch a link off when you&apos;re done.
            {!isSuperAdmin && (
              <>
                {" "}
                You can invite into the departments you lead, as a Member or
                Volunteer.
              </>
            )}
          </p>

          <form onSubmit={create} className="space-y-3 rounded-xl border border-ink-100 bg-ink-50 p-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="mb-1 block text-sm font-medium text-ink-600">Label</span>
                <input
                  className="ah-input"
                  placeholder="Media Team signup"
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-sm font-medium text-ink-600">They join as</span>
                <select className="ah-input" value={role} onChange={(e) => setRole(e.target.value as UserRole)}>
                  {allowedRoles.map((r) => (
                    <option key={r} value={r}>
                      {r.replace("_", " ")}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="mb-1 block text-sm font-medium text-ink-600">Campus</span>
                <select className="ah-input" value={campusId} onChange={(e) => setCampusId(e.target.value)}>
                  <option value="">No campus</option>
                  {campuses.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </label>
              <div className="grid grid-cols-2 gap-2">
                <label className="block">
                  <span className="mb-1 block text-sm font-medium text-ink-600">Expires</span>
                  <input type="date" className="ah-input" value={expires} onChange={(e) => setExpires(e.target.value)} />
                </label>
                <label className="block">
                  <span className="mb-1 block text-sm font-medium text-ink-600">Max uses</span>
                  <input type="number" min={1} className="ah-input" placeholder="∞" value={maxUses} onChange={(e) => setMaxUses(e.target.value)} />
                </label>
              </div>
            </div>

            <div>
              <span className="mb-1 block text-sm font-medium text-ink-600">
                Departments they join
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
                        on ? "bg-accent text-onaccent" : "bg-white text-ink-600 ring-1 ring-ink-200 hover:bg-ink-100"
                      }`}
                    >
                      {d.name}
                    </button>
                  );
                })}
              </div>
            </div>

            {error && <p className="rounded-lg bg-brand-50 px-3 py-2 text-sm text-brand-700">{error}</p>}

            <button
              type="submit"
              disabled={busy}
              className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-onaccent hover:bg-accent-strong disabled:opacity-60"
            >
              {busy ? "Creating…" : "Create invite link"}
            </button>
          </form>

          {links.length === 0 ? (
            <p className="mt-4 rounded-xl border border-dashed border-ink-200 px-4 py-6 text-center text-sm text-ink-400">
              No invite links yet — create one above and share it.
            </p>
          ) : (
          <div className="mt-4 divide-y divide-ink-100 overflow-hidden rounded-xl border border-ink-100">
            {links.map((l) => (
              <div key={l.id} className="px-3 py-2.5">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-semibold text-ink-900">{l.label}</span>
                  <span className="rounded bg-ink-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-ink-600">
                    {l.role.replace("_", " ")}
                  </span>
                  {!l.active && (
                    <span className="rounded bg-ink-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-ink-600">
                      off
                    </span>
                  )}
                  <span className="flex-1" />
                  <button onClick={() => toggleActive(l)} className="text-xs font-medium text-ink-600 underline">
                    {l.active ? "Turn off" : "Turn on"}
                  </button>
                  <button onClick={() => remove(l.id)} className="text-ink-400 hover:text-brand-600" aria-label="Delete">
                    <Icon name="trash" size={15} />
                  </button>
                </div>

                <div className="mt-2 flex gap-2">
                  <input readOnly className="ah-input text-xs" value={urlFor(l.code)} />
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(urlFor(l.code));
                      setCopiedId(l.id);
                      setTimeout(() => setCopiedId(null), 1500);
                    }}
                    className="shrink-0 rounded-lg bg-accent px-3 py-2 text-sm font-medium text-onaccent"
                  >
                    {copiedId === l.id ? "Copied" : "Copy"}
                  </button>
                </div>

                <p className="mt-1.5 text-xs text-ink-400">
                  {l.uses} joined
                  {l.max_uses != null && ` of ${l.max_uses}`}
                  {l.expires_at &&
                    ` · expires ${new Date(l.expires_at).toLocaleDateString()}`}
                </p>
              </div>
            ))}
          </div>
          )}
        </div>
      )}
    </div>
  );
}
