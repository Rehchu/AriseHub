"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { Campus, Department } from "@/lib/database.types";
import { Icon } from "@/components/shell/Icon";

export interface DirectoryPerson {
  id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  role: string;
  campus: string | null;
  departments: string[];
}

function initials(name: string) {
  return name
    .split(" ")
    .map((s) => s[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

export function PeopleDirectory({
  people,
  campuses,
  departments,
}: {
  people: DirectoryPerson[];
  campuses: Pick<Campus, "id" | "name">[];
  departments: Pick<Department, "id" | "name">[];
}) {
  const [q, setQ] = useState("");
  const [campus, setCampus] = useState("");
  const [dept, setDept] = useState("");
  const [selected, setSelected] = useState<DirectoryPerson | null>(null);

  const filtered = useMemo(() => {
    return people.filter((p) => {
      if (q && !(`${p.full_name} ${p.email ?? ""}`.toLowerCase().includes(q.toLowerCase())))
        return false;
      if (campus && p.campus !== campus) return false;
      if (dept && !p.departments.includes(dept)) return false;
      return true;
    });
  }, [people, q, campus, dept]);

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      <div className="mb-6">
        <h1 className="font-display text-2xl font-bold text-ink-900">People</h1>
        <p className="mt-1 text-ink-500">
          Church-wide directory · {people.length} {people.length === 1 ? "person" : "people"}
        </p>
      </div>

      <div className="mb-5 flex flex-wrap gap-2">
        <input
          className="ah-input max-w-xs"
          placeholder="Search by name or email…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <select className="ah-input w-auto" value={campus} onChange={(e) => setCampus(e.target.value)}>
          <option value="">All campuses</option>
          {campuses.map((c) => (
            <option key={c.id} value={c.name}>
              {c.name}
            </option>
          ))}
        </select>
        <select className="ah-input w-auto" value={dept} onChange={(e) => setDept(e.target.value)}>
          <option value="">All departments</option>
          {departments.map((d) => (
            <option key={d.id} value={d.name}>
              {d.name}
            </option>
          ))}
        </select>
      </div>

      {filtered.length === 0 ? (
        <p className="rounded-xl border border-dashed border-ink-200 px-4 py-10 text-center text-sm text-ink-400">
          No people match those filters.
        </p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((p) => (
            <button
              key={p.id}
              onClick={() => setSelected(p)}
              className="flex items-center gap-3 rounded-xl border border-ink-100 bg-white p-4 text-left transition hover:shadow-md"
            >
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-brand-100 font-semibold text-brand-700">
                {initials(p.full_name)}
              </span>
              <div className="min-w-0">
                <p className="truncate font-medium text-ink-900">{p.full_name}</p>
                <p className="truncate text-xs text-ink-400">
                  {p.role.replace("_", " ")}
                  {p.campus && ` · ${p.campus}`}
                </p>
                {p.departments.length > 0 && (
                  <p className="mt-1 truncate text-xs text-ink-500">
                    {p.departments.join(" · ")}
                  </p>
                )}
              </div>
            </button>
          ))}
        </div>
      )}

      {selected && <PersonDrawer person={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}

function PersonDrawer({
  person,
  onClose,
}: {
  person: DirectoryPerson;
  onClose: () => void;
}) {
  const supabase = createClient();
  const router = useRouter();

  async function message() {
    const { data } = await supabase.rpc("get_or_create_dm", {
      other_profile: person.id,
    });
    if (data) router.push(`/messages/${data}`);
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/40" onClick={onClose}>
      <div
        className="h-full w-full max-w-sm overflow-y-auto bg-white p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between">
          <span className="flex h-16 w-16 items-center justify-center rounded-full bg-brand-100 text-xl font-semibold text-brand-700">
            {initials(person.full_name)}
          </span>
          <button onClick={onClose} className="text-ink-400 hover:text-ink-700">
            <Icon name="x" />
          </button>
        </div>
        <h2 className="font-display text-xl font-bold text-ink-900">{person.full_name}</h2>
        <p className="text-sm text-ink-500">
          {person.role.replace("_", " ")}
          {person.campus && ` · ${person.campus}`}
        </p>

        <div className="mt-5 space-y-3 text-sm">
          {person.email && (
            <Row label="Email">
              <a href={`mailto:${person.email}`} className="text-brand-600 hover:underline">
                {person.email}
              </a>
            </Row>
          )}
          {person.phone && (
            <Row label="Phone">
              <a href={`tel:${person.phone}`} className="text-brand-600 hover:underline">
                {person.phone}
              </a>
            </Row>
          )}
          {person.departments.length > 0 && (
            <Row label="Departments">
              <div className="flex flex-wrap gap-1.5">
                {person.departments.map((d) => (
                  <span key={d} className="rounded-full bg-ink-100 px-2 py-0.5 text-xs text-ink-600">
                    {d}
                  </span>
                ))}
              </div>
            </Row>
          )}
        </div>

        <button
          onClick={message}
          className="mt-6 flex w-full items-center justify-center gap-2 rounded-lg bg-brand-500 py-2.5 font-semibold text-white hover:bg-brand-600"
        >
          <Icon name="send" size={18} /> Send a message
        </button>
      </div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wide text-ink-400">{label}</p>
      <div className="mt-0.5 text-ink-800">{children}</div>
    </div>
  );
}
