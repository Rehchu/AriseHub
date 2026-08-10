"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { Campus, Department } from "@/lib/database.types";
import { Icon } from "@/components/shell/Icon";
import { Avatar } from "./Avatar";
import { Modal } from "@/components/ui/Modal";

export interface DirectoryPerson {
  id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  role: string;
  title: string | null;
  photo_url: string | null;
  campus: string | null;
  departments: string[];
}

/**
 * Directory-level numbers for the stat strip. Each one is null when the
 * viewer's data access (or a failed query) means we cannot answer it honestly —
 * a null stat simply does not render.
 */
export interface DirectoryStats {
  newThisMonth: number | null;
  serving: { count: number; pct: number } | null;
  total: number | null;
}

// Staff-level roles read as a brand-tinted tag; everyone else gets the quiet one.
const STAFF_ROLES = new Set(["Super_Admin", "IT_Admin", "Staff"]);

function roleLabel(role: string) {
  return role.replace(/_/g, " ");
}

function RoleTag({ role }: { role: string }) {
  const staff = STAFF_ROLES.has(role);
  return (
    <span
      className={`inline-block whitespace-nowrap rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
        staff ? "bg-brand-50 text-brand-700" : "bg-ink-100 text-ink-600"
      }`}
    >
      {roleLabel(role)}
    </span>
  );
}

export function PeopleDirectory({
  people,
  campuses,
  departments,
  stats,
  canInvite = false,
}: {
  people: DirectoryPerson[];
  campuses: Pick<Campus, "id" | "name">[];
  departments: Pick<Department, "id" | "name">[];
  stats: DirectoryStats;
  /** Whether the viewer may use /invite — the "Add person" action hides otherwise. */
  canInvite?: boolean;
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
      <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-3">
        <div className="flex items-baseline gap-3">
          <h1 className="font-display text-2xl font-bold text-ink-900">People</h1>
          <p className="text-sm text-ink-500">
            {people.length} in directory
          </p>
        </div>
        <input
          className="ah-input max-w-xs sm:ml-auto"
          placeholder="Search by name or email…"
          aria-label="Search people by name or email"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        {canInvite && (
          // People are added by invite link (0018) — this is that flow, not a
          // separate creation form.
          <Link
            href="/invite"
            className="inline-flex items-center gap-2 rounded-lg bg-accent px-3.5 py-2 text-sm font-semibold text-onaccent transition hover:bg-accent-strong"
          >
            <Icon name="users" size={18} />
            Add person
          </Link>
        )}
      </div>

      <div className="mb-5 flex flex-wrap gap-2">
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
        <table className="w-full table-fixed text-sm">
          <thead>
            <tr className="border-b border-ink-200 text-left">
              <Th className="w-[40%]">Name</Th>
              <Th className="hidden w-[28%] md:table-cell">Departments</Th>
              <Th className="hidden w-[18%] md:table-cell">Campus</Th>
              <Th className="w-[14%]">Status</Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-ink-100">
            {filtered.map((p) => (
              <tr
                key={p.id}
                role="button"
                tabIndex={0}
                aria-haspopup="dialog"
                aria-label={`View ${p.full_name}`}
                onClick={() => setSelected(p)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    setSelected(p);
                  }
                }}
                className="cursor-pointer transition hover:bg-white focus-visible:outline focus-visible:outline-2 outline-accent"
              >
                <td className="px-2 py-2.5">
                  <div className="flex items-center gap-2.5">
                    <Avatar name={p.full_name} photo={p.photo_url} size={28} />
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-ink-900">{p.full_name}</p>
                      {p.title && <p className="truncate text-xs text-ink-400">{p.title}</p>}
                      {(p.departments.length > 0 || p.campus) && (
                        <p className="truncate text-xs text-ink-500 md:hidden">
                          {[p.departments.join(" · "), p.campus].filter(Boolean).join(" — ")}
                        </p>
                      )}
                    </div>
                  </div>
                </td>
                <td className="hidden truncate px-2 py-2.5 text-ink-500 md:table-cell">
                  {p.departments.length > 0 ? p.departments.join(" · ") : <span className="text-ink-400">—</span>}
                </td>
                <td className="hidden truncate px-2 py-2.5 text-ink-500 md:table-cell">
                  {p.campus ?? <span className="text-ink-400">—</span>}
                </td>
                <td className="px-2 py-2.5">
                  <RoleTag role={p.role} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <StatStrip stats={stats} />

      {selected && <PersonDrawer person={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}

function Th({ className = "", children }: { className?: string; children: React.ReactNode }) {
  return (
    <th className={`px-2 py-2 text-[10px] font-semibold uppercase tracking-wide text-ink-400 ${className}`}>
      {children}
    </th>
  );
}

function StatStrip({ stats }: { stats: DirectoryStats }) {
  const cells: { kicker: string; value: string; note: string }[] = [];
  if (stats.newThisMonth !== null)
    cells.push({
      kicker: "New this month",
      value: String(stats.newThisMonth),
      note: "joined since the 1st",
    });
  if (stats.serving !== null)
    cells.push({
      kicker: "Serving",
      value: `${stats.serving.pct}%`,
      note: `${stats.serving.count} of ${stats.total ?? "—"} in a department`,
    });
  if (stats.total !== null)
    cells.push({
      kicker: "In directory",
      value: String(stats.total),
      note: "everyone you can see",
    });
  if (cells.length === 0) return null;

  const cols = { 1: "sm:grid-cols-1", 2: "sm:grid-cols-2", 3: "sm:grid-cols-3" }[
    cells.length as 1 | 2 | 3
  ];

  return (
    <div
      className={`mt-6 grid divide-y divide-ink-100 rounded-xl border border-ink-100 bg-white sm:divide-x sm:divide-y-0 ${cols}`}
    >
      {cells.map((c) => (
        <div key={c.kicker} className="px-4 py-3">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-ink-400">{c.kicker}</p>
          <p className="mt-0.5 font-display text-[26px] font-bold leading-8 text-ink-900">{c.value}</p>
          <p className="truncate text-xs text-ink-500">{c.note}</p>
        </div>
      ))}
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

  // A dead button otherwise: `error` was dropped on the floor, so a failed RPC
  // did nothing at all — no spinner, no message, the drawer just sat there — and
  // people tapped it again and again, firing the RPC each time.
  const [opening, setOpening] = useState(false);
  const [dmError, setDmError] = useState<string | null>(null);

  async function message() {
    if (opening) return;
    setOpening(true);
    setDmError(null);
    const { data, error } = await supabase.rpc("get_or_create_dm", {
      other_profile: person.id,
    });
    if (error || !data) {
      setOpening(false);
      setDmError(error?.message ?? "Couldn't open a conversation with them.");
      return;
    }
    router.push(`/messages/${data}`);
  }

  return (
    <Modal onClose={onClose} justify="end" dim="bg-black/40" label="Person details">
      <div
        className="h-full w-full max-w-sm overflow-y-auto bg-white p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between">
          <Avatar name={person.full_name} photo={person.photo_url} size={64} />
          <button onClick={onClose} aria-label="Close" className="text-ink-400 hover:text-ink-700">
            <Icon name="x" />
          </button>
        </div>
        <h2 className="font-display text-xl font-bold text-ink-900">{person.full_name}</h2>
        <p className="text-sm text-ink-500">
          {person.title || roleLabel(person.role)}
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
          {!person.email && !person.phone && (
            <p className="rounded-lg bg-ink-50 px-3 py-2 text-xs text-ink-500">
              Contact details are visible to leadership only. Use the message
              button below to reach them.
            </p>
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

        {dmError && (
          <p className="mt-4 rounded-lg bg-brand-50 px-3 py-2 text-sm text-brand-700">{dmError}</p>
        )}
        <button
          onClick={message}
          disabled={opening}
          className="mt-6 flex w-full items-center justify-center gap-2 rounded-lg bg-accent py-2.5 font-semibold text-onaccent hover:bg-accent-strong disabled:opacity-60"
        >
          <Icon name="send" size={18} /> {opening ? "Opening…" : "Send a message"}
        </button>
      </div>
    </Modal>
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
