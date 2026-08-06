"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Campus, Department, Profile, UserRole } from "@/lib/database.types";
import { Icon } from "@/components/shell/Icon";
import { InvitePanel } from "./InvitePanel";

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
  fields = [],
  valueMap = {},
}: {
  profiles: Profile[];
  departments: Department[];
  campuses: Campus[];
  memberMap: Record<string, string[]>;
  fields?: PersonFieldDef[];
  valueMap?: Record<string, Record<string, string>>;
}) {
  const supabase = createClient();
  const [people, setPeople] = useState<Profile[]>(profiles);
  const [members, setMembers] = useState<Record<string, string[]>>(memberMap);
  const [values, setValues] = useState<Record<string, Record<string, string>>>(valueMap);
  const [q, setQ] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

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
      <InvitePanel departments={departments} campuses={campuses} />

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

        <div className="overflow-hidden rounded-xl border border-ink-100 bg-white">
          {filtered.map((p) => {
            const isOpen = expanded === p.id;
            const deptIds = new Set(members[p.id] ?? []);
            return (
              <div key={p.id} className="border-b border-ink-100 last:border-0">
                <div className="flex flex-wrap items-center gap-3 px-4 py-3">
                  <span className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-100 text-xs font-semibold text-brand-700">
                    {p.full_name
                      .split(" ")
                      .map((s) => s[0])
                      .slice(0, 2)
                      .join("")
                      .toUpperCase()}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-ink-900">
                      {p.full_name}
                      {p.archived_at && (
                        <span className="ml-2 rounded bg-ink-100 px-1.5 py-0.5 text-[10px] uppercase text-ink-400">
                          archived
                        </span>
                      )}
                    </p>
                    <p className="truncate text-xs text-ink-400">{p.email}</p>
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
                    <div className="mb-2 flex items-center gap-2 text-xs font-medium text-ink-500">
                      <Icon name="group" size={14} /> Department memberships
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {departments.map((d) => {
                        const on = deptIds.has(d.id);
                        return (
                          <button
                            key={d.id}
                            onClick={() => toggleDept(p.id, d.id, !on)}
                            className={`rounded-full px-3 py-1 text-sm transition ${
                              on
                                ? "bg-brand-500 text-white"
                                : "bg-white text-ink-600 ring-1 ring-ink-200 hover:bg-ink-100"
                            }`}
                          >
                            {d.name}
                          </button>
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
