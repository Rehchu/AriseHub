"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Campus, Department, Profile, UserRole } from "@/lib/database.types";
import { Icon } from "@/components/shell/Icon";
import { InvitePanel } from "./InvitePanel";
import { Avatar } from "@/components/people/Avatar";

// Suggestions only — the field is free text so unusual titles still work.
const TITLES = [
  "Apostle",
  "Pastor",
  "Co-Pastor",
  "Elder",
  "Minister",
  "Deacon",
  "Department Head",
  "Worship Leader",
  "Administrator",
];

const ROLES: UserRole[] = ["Super_Admin", "IT_Admin", "Staff", "Volunteer", "Member"];

export interface PersonFieldDef {
  id: string;
  label: string;
  field_type: "text" | "number" | "date" | "select" | "checkbox";
  options: string[] | null;
  sort_order: number;
}

export function PeopleAdmin({
  profiles,
  departments,
  campuses,
  memberMap,
  leadMap = {},
  fields = [],
  valueMap = {},
}: {
  profiles: Profile[];
  departments: Department[];
  campuses: Campus[];
  memberMap: Record<string, string[]>;
  leadMap?: Record<string, Record<string, string>>;
  fields?: PersonFieldDef[];
  valueMap?: Record<string, Record<string, string>>;
}) {
  const supabase = createClient();
  const [people, setPeople] = useState<Profile[]>(profiles);
  const [members, setMembers] = useState<Record<string, string[]>>(memberMap);
  const [leads, setLeads] = useState<Record<string, Record<string, string>>>(leadMap);

  // Promote/demote within a department. Leads manage their department's roster
  // and can assign tasks to its members.
  async function setDeptRole(profileId: string, deptId: string, role: "lead" | "member") {
    setLeads((l) => ({ ...l, [profileId]: { ...(l[profileId] ?? {}), [deptId]: role } }));
    const { error } = await supabase
      .from("department_members")
      .update({ role })
      .eq("profile_id", profileId)
      .eq("department_id", deptId);
    if (error) setError(error.message);
  }
  const [values, setValues] = useState<Record<string, Record<string, string>>>(valueMap);
  const [q, setQ] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [resetLink, setResetLink] = useState<{ name: string; link: string } | null>(null);
  const [resetting, setResetting] = useState<string | null>(null);

  // IT / Super_Admin can issue a set-password link. We never see or set the
  // password — the person chooses their own from the link.
  async function resetPassword(p: Profile) {
    if (!p.email) return setError(`${p.full_name} has no email on file.`);
    setResetting(p.id);
    setError(null);
    try {
      const res = await fetch("/api/admin/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: p.email }),
      });
      const j = (await res.json()) as { link?: string; error?: string };
      if (!res.ok || !j.link) throw new Error(j.error ?? "Failed");
      setResetLink({ name: p.full_name, link: j.link });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create a reset link.");
    } finally {
      setResetting(null);
    }
  }

  async function setFieldValue(profileId: string, fieldId: string, value: string) {
    setValues((v) => ({ ...v, [profileId]: { ...(v[profileId] ?? {}), [fieldId]: value } }));
    const { error } = await supabase
      .from("person_field_values")
      .upsert(
        { profile_id: profileId, field_id: fieldId, value },
        { onConflict: "profile_id,field_id" },
      );
    if (error) setError(error.message);
  }

  const filtered = people.filter((p) =>
    (p.full_name + " " + (p.email ?? "")).toLowerCase().includes(q.toLowerCase()),
  );

  async function patch(id: string, fields: Partial<Profile>) {
    setError(null);
    setPeople((ps) => ps.map((p) => (p.id === id ? { ...p, ...fields } : p)));
    const { error } = await supabase.from("profiles").update(fields).eq("id", id);
    if (error) setError(error.message);
  }

  async function toggleDept(profileId: string, deptId: string, on: boolean) {
    setError(null);
    setMembers((m) => {
      const cur = new Set(m[profileId] ?? []);
      if (on) cur.add(deptId);
      else cur.delete(deptId);
      return { ...m, [profileId]: [...cur] };
    });
    if (on) {
      setLeads((l) => ({ ...l, [profileId]: { ...(l[profileId] ?? {}), [deptId]: "member" } }));
      const { error } = await supabase
        .from("department_members")
        .insert({ department_id: deptId, profile_id: profileId });
      if (error) setError(error.message);
    } else {
      const { error } = await supabase
        .from("department_members")
        .delete()
        .eq("department_id", deptId)
        .eq("profile_id", profileId);
      if (error) setError(error.message);
    }
  }

  return (
    <div className="space-y-6">
      {resetLink && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
          <p className="mb-2 text-sm font-medium text-amber-900">
            Set-password link for {resetLink.name} — send it to them directly. It
            works once and expires; nobody (including you) sees their password.
          </p>
          <div className="flex gap-2">
            <input readOnly value={resetLink.link} className="ah-input bg-white text-xs" />
            <button
              onClick={() => navigator.clipboard.writeText(resetLink.link)}
              className="shrink-0 rounded-lg bg-amber-600 px-3 py-2 text-sm font-medium text-white"
            >
              Copy
            </button>
            <button
              onClick={() => setResetLink(null)}
              className="shrink-0 rounded-lg px-2 text-amber-700"
              aria-label="Dismiss"
            >
              <Icon name="x" />
            </button>
          </div>
        </div>
      )}

      <InvitePanel departments={departments} campuses={campuses} isSuperAdmin />

      <div>
        <input
          className="ah-input mb-3"
          placeholder="Search people…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />

        {error && (
          <p className="mb-3 rounded-lg bg-brand-50 px-3 py-2 text-sm text-brand-700">
            {error}
          </p>
        )}

        <datalist id="ah-titles">
          {TITLES.map((t) => (
            <option key={t} value={t} />
          ))}
        </datalist>

        <div className="overflow-hidden rounded-xl border border-ink-100 bg-white">
          {filtered.map((p) => {
            const isOpen = expanded === p.id;
            const deptIds = new Set(members[p.id] ?? []);
            return (
              <div key={p.id} className="border-b border-ink-100 last:border-0">
                <div className="flex flex-wrap items-center gap-3 px-4 py-3">
                  <Avatar name={p.full_name} photo={p.photo_url} size={36} />
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-ink-900">
                      {p.full_name}
                      {p.archived_at && (
                        <span className="ml-2 rounded bg-ink-100 px-1.5 py-0.5 text-[10px] uppercase text-ink-400">
                          archived
                        </span>
                      )}
                      {p.hidden_from_directory && (
                        <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] uppercase text-amber-800">
                          hidden
                        </span>
                      )}
                    </p>
                    <p className="truncate text-xs text-ink-400">
                      {p.title && (
                        <span className="mr-1.5 font-medium text-brand-600">{p.title}</span>
                      )}
                      {p.email}
                    </p>
                  </div>

                  <select
                    value={p.role}
                    onChange={(e) => patch(p.id, { role: e.target.value as UserRole })}
                    className="ah-input w-auto py-1.5 text-sm"
                    aria-label="Role"
                  >
                    {ROLES.map((r) => (
                      <option key={r} value={r}>
                        {r.replace("_", " ")}
                      </option>
                    ))}
                  </select>

                  <select
                    value={p.campus_id ?? ""}
                    onChange={(e) =>
                      patch(p.id, { campus_id: e.target.value || null })
                    }
                    className="ah-input w-auto py-1.5 text-sm"
                    aria-label="Campus"
                  >
                    <option value="">No campus</option>
                    {campuses.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>

                  <button
                    onClick={() => setExpanded(isOpen ? null : p.id)}
                    className="rounded-lg px-2.5 py-1.5 text-sm font-medium text-ink-600 hover:bg-ink-50"
                  >
                    Departments ({deptIds.size})
                  </button>
                  <button
                    onClick={() => resetPassword(p)}
                    disabled={resetting === p.id}
                    className="rounded-lg px-2.5 py-1.5 text-sm font-medium text-ink-600 hover:bg-ink-50 disabled:opacity-50"
                    title="Generate a set-password link for this person"
                  >
                    {resetting === p.id ? "…" : "Reset password"}
                  </button>
                  <button
                    onClick={() =>
                      patch(p.id, {
                        archived_at: p.archived_at ? null : new Date().toISOString(),
                      })
                    }
                    className="rounded-lg px-2.5 py-1.5 text-sm font-medium text-ink-600 hover:bg-ink-50"
                  >
                    {p.archived_at ? "Restore" : "Archive"}
                  </button>
                </div>

                {isOpen && (
                  <div className="border-t border-ink-100 bg-ink-50 px-4 py-3">
                    {/* Ministry title is what people are *called*; the role select
                        above is what they can *do*. Our Apostle and Pastor are
                        Super_Admins who should read as Apostle and Pastor. */}
                    <label className="mb-3 block">
                      <span className="mb-1 flex items-center gap-2 text-xs font-medium text-ink-500">
                        <Icon name="badge" size={14} /> Ministry title
                      </span>
                      <input
                        className="ah-input max-w-xs py-1.5 text-sm"
                        placeholder="Apostle, Pastor, Elder…"
                        defaultValue={p.title ?? ""}
                        list="ah-titles"
                        onBlur={(e) => {
                          const v = e.target.value.trim();
                          if (v !== (p.title ?? "")) patch(p.id, { title: v || null });
                        }}
                      />
                      <span className="mt-1 block text-xs text-ink-400">
                        Shown throughout the app. Permissions still come from the
                        role above.
                      </span>
                    </label>

                    <div className="mb-2 flex items-center gap-2 text-xs font-medium text-ink-500">
                      <Icon name="group" size={14} /> Department memberships
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {departments.map((d) => {
                        const on = deptIds.has(d.id);
                        const isLead = leads[p.id]?.[d.id] === "lead";
                        return (
                          <span
                            key={d.id}
                            className={`inline-flex items-center overflow-hidden rounded-full ring-1 ${
                              on ? "ring-brand-500" : "ring-ink-200"
                            }`}
                          >
                            <button
                              onClick={() => toggleDept(p.id, d.id, !on)}
                              className={`px-3 py-1 text-sm transition ${
                                on
                                  ? "bg-brand-500 text-white"
                                  : "bg-white text-ink-600 hover:bg-ink-100"
                              }`}
                            >
                              {d.name}
                            </button>
                            {/* Promote to department lead — leads manage their
                                roster and can assign tasks to its members. */}
                            {on && (
                              <button
                                onClick={() =>
                                  setDeptRole(p.id, d.id, isLead ? "member" : "lead")
                                }
                                title={isLead ? "Department lead — click to demote" : "Make department lead"}
                                className={`px-2 py-1 text-xs font-semibold transition ${
                                  isLead
                                    ? "bg-brand-700 text-white"
                                    : "bg-brand-100 text-brand-700 hover:bg-brand-200"
                                }`}
                              >
                                {isLead ? "LEAD" : "＋lead"}
                              </button>
                            )}
                          </span>
                        );
                      })}
                    </div>
                    <label className="mt-3 flex items-center gap-2 text-sm text-ink-700">
                      <input
                        type="checkbox"
                        checked={p.is_checkin_lead}
                        onChange={(e) =>
                          patch(p.id, { is_checkin_lead: e.target.checked })
                        }
                      />
                      Check-in lead (can view children&apos;s medical info)
                    </label>
                    {/* Migration 0036 added this column; nothing wrote to it
                        until now, so hidden accounts were not actually
                        reachable from the app. */}
                    <label className="mt-2 flex items-start gap-2 text-sm text-ink-700">
                      <input
                        type="checkbox"
                        className="mt-0.5"
                        checked={p.hidden_from_directory}
                        onChange={(e) =>
                          patch(p.id, { hidden_from_directory: e.target.checked })
                        }
                      />
                      <span>
                        Hide from the People directory
                        <span className="block text-xs text-ink-400">
                          For service and QA accounts. They sign in and are governed by
                          exactly the same permissions as anyone else — they just don&apos;t
                          appear next to real members. Leadership still sees them here.
                        </span>
                      </span>
                    </label>

                    {fields.length > 0 && (
                      <div className="mt-4 border-t border-ink-200 pt-3">
                        <div className="mb-2 flex items-center gap-2 text-xs font-medium text-ink-500">
                          <Icon name="form" size={14} /> Custom fields
                        </div>
                        <div className="grid gap-3 sm:grid-cols-2">
                          {fields.map((fld) => {
                            const val = values[p.id]?.[fld.id] ?? "";
                            return (
                              <label key={fld.id} className="block text-sm">
                                <span className="mb-1 block font-medium text-ink-600">{fld.label}</span>
                                {fld.field_type === "select" ? (
                                  <select
                                    className="ah-input"
                                    value={val}
                                    onChange={(e) => setFieldValue(p.id, fld.id, e.target.value)}
                                  >
                                    <option value="">—</option>
                                    {(fld.options ?? []).map((o) => (
                                      <option key={o} value={o}>
                                        {o}
                                      </option>
                                    ))}
                                  </select>
                                ) : fld.field_type === "checkbox" ? (
                                  <input
                                    type="checkbox"
                                    checked={val === "true"}
                                    onChange={(e) => setFieldValue(p.id, fld.id, String(e.target.checked))}
                                  />
                                ) : (
                                  <input
                                    type={
                                      fld.field_type === "number"
                                        ? "number"
                                        : fld.field_type === "date"
                                          ? "date"
                                          : "text"
                                    }
                                    className="ah-input"
                                    value={val}
                                    onChange={(e) => setFieldValue(p.id, fld.id, e.target.value)}
                                  />
                                )}
                              </label>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
          {filtered.length === 0 && (
            <p className="px-4 py-6 text-center text-sm text-ink-400">
              No people found.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
