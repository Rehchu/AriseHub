"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Icon } from "@/components/shell/Icon";
import { notify } from "@/lib/notify";
import { availabilityFor, type Blockout, type ServingPattern } from "@/lib/availability";
import { Modal } from "@/components/ui/Modal";

export interface SchedulePlan {
  id: string;
  title: string;
  service_date: string; // yyyy-mm-dd
  department_id: string | null;
  assignments: {
    id: string;
    position: string;
    profile_id: string | null;
    status: "invited" | "accepted" | "declined";
    name: string | null;
  }[];
}

type AssignmentStatus = SchedulePlan["assignments"][number]["status"];

function ymd(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** "2026-08-16" → "AUG 16", for kickers and column headers. */
function kicker(date: string) {
  return new Date(date + "T00:00:00")
    .toLocaleDateString(undefined, { month: "short", day: "numeric" })
    .toUpperCase();
}

/** One status tag, everywhere a status is shown. */
function StatusTag({ status }: { status: AssignmentStatus }) {
  if (status === "accepted") {
    return <span className="rounded bg-brand-50 px-2 py-0.5 text-[11px] font-medium text-brand-700">Confirmed</span>;
  }
  if (status === "declined") {
    return <span className="rounded border border-ink-200 px-2 py-0.5 text-[11px] text-ink-500">Declined</span>;
  }
  return <span className="rounded bg-ink-100 px-2 py-0.5 text-[11px] font-medium text-ink-600">Pending</span>;
}

/**
 * The scheduling matrix. The next three service dates as a stat strip, and
 * beneath them every scheduled person as a row: who is confirmed, pending or
 * declined on each date, at a glance. Filtered by department so each team sees
 * only their own rota. Click a date to see its plans — and, if you run
 * services, to send someone a request right there.
 */
export function ScheduleMatrix({
  plans: initialPlans,
  departments,
  myDepartmentIds,
  people,
  blockouts,
  patterns,
  canManage,
  currentProfileId,
  today: serverToday,
}: {
  plans: SchedulePlan[];
  departments: { id: string; name: string }[];
  myDepartmentIds: string[];
  people: { id: string; full_name: string }[];
  blockouts: Blockout[];
  patterns: ServingPattern[];
  canManage: boolean;
  currentProfileId: string;
  /** Today per the server clock — the client's local date takes over on mount. */
  today: string;
}) {
  const [plans, setPlans] = useState(initialPlans);

  // Only departments that actually have plans get a segment.
  const deptTabs = useMemo(() => {
    const withPlans = new Set(initialPlans.map((p) => p.department_id));
    return departments.filter((d) => withPlans.has(d.id));
  }, [initialPlans, departments]);

  const [dept, setDept] = useState<string>(() => {
    const withPlans = new Set(initialPlans.map((p) => p.department_id));
    return myDepartmentIds.find((id) => withPlans.has(id)) ?? "";
  });
  const [openDate, setOpenDate] = useState<string | null>(null);
  // null = "the window starting today"; a number pins an explicit start index.
  const [overrideStart, setOverrideStart] = useState<number | null>(null);

  // Resolved after mount. `new Date()` during render runs on the server too,
  // and the server is UTC — so a Sunday evening in Central time is already
  // Monday there, and the matrix would start one service late until React
  // patched it. Until mount, both sides agree on the server's date.
  const [todayStr, setTodayStr] = useState("");
  useEffect(() => setTodayStr(ymd(new Date())), []);
  const effectiveToday = todayStr || serverToday;

  const visible = useMemo(
    () => (dept ? plans.filter((p) => p.department_id === dept) : plans),
    [plans, dept],
  );

  const byDate = useMemo(() => {
    const m: Record<string, SchedulePlan[]> = {};
    for (const p of visible) (m[p.service_date] ??= []).push(p);
    return m;
  }, [visible]);

  const allDates = useMemo(() => Object.keys(byDate).sort(), [byDate]);

  const maxStart = Math.max(0, allDates.length - 3);
  const defaultStart = (() => {
    const i = allDates.findIndex((d) => d >= effectiveToday);
    return i === -1 ? maxStart : Math.min(i, maxStart);
  })();
  const startIdx = Math.min(Math.max(overrideStart ?? defaultStart, 0), maxStart);
  const cols = allDates.slice(startIdx, startIdx + 3);

  // Stat strip: accepted / total per date, plus the one thing worth saying.
  const stats = cols.map((date) => {
    const assignments = (byDate[date] ?? []).flatMap((p) => p.assignments);
    const total = assignments.length;
    const accepted = assignments.filter((a) => a.status === "accepted").length;
    const declined = assignments.filter((a) => a.status === "declined").length;
    const unfilled = assignments.filter((a) => a.profile_id === null).length;
    const pending = assignments.filter((a) => a.status === "invited" && a.profile_id !== null).length;
    let line: { text: string; attention: boolean };
    if (total === 0) line = { text: "requests not sent", attention: false };
    else if (unfilled > 0) line = { text: `${unfilled} unfilled`, attention: true };
    else if (declined > 0) line = { text: `${declined} declined to re-cover`, attention: false };
    else if (pending > 0) line = { text: `${pending} awaiting reply`, attention: false };
    else line = { text: "fully confirmed", attention: false };
    return { date, total, accepted, line };
  });

  // Matrix rows: everyone holding an assignment across the visible dates.
  // Where someone holds several on one date, the loudest status wins —
  // a decline needs re-covering even if another position is confirmed.
  // Plain computation, no memo: a rota is at most a few hundred assignments.
  const rank: Record<AssignmentStatus, number> = { accepted: 1, invited: 2, declined: 3 };
  const rowMap = new Map<string, { name: string; positions: Set<string>; perDate: Record<string, AssignmentStatus> }>();
  for (const date of cols) {
    for (const p of byDate[date] ?? []) {
      for (const a of p.assignments) {
        if (!a.profile_id) continue;
        const row = rowMap.get(a.profile_id) ?? { name: a.name ?? "Unknown", positions: new Set<string>(), perDate: {} };
        row.positions.add(a.position);
        const prev = row.perDate[date];
        if (!prev || rank[a.status] > rank[prev]) row.perDate[date] = a.status;
        rowMap.set(a.profile_id, row);
      }
    }
  }
  const rows = [...rowMap.entries()]
    .map(([id, r]) => ({ id, name: r.name, positions: [...r.positions].join(", "), perDate: r.perDate }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      <Link href="/services" className="mb-4 inline-flex items-center gap-1 text-sm text-ink-500 hover:text-brand-600">
        ← Services
      </Link>

      {/* Header: title, department filter, send requests */}
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <h1 className="font-display text-2xl font-bold text-ink-900">Scheduling</h1>

        {deptTabs.length > 0 && (
          <div className="flex flex-wrap rounded-lg bg-ink-100 p-1 text-sm font-medium">
            <button
              onClick={() => {
                setDept("");
                setOverrideStart(null);
              }}
              aria-pressed={dept === ""}
              className={`rounded-md px-3 py-1 ${dept === "" ? "bg-white shadow-sm" : "text-ink-500"}`}
            >
              All teams
            </button>
            {deptTabs.map((d) => (
              <button
                key={d.id}
                onClick={() => {
                  setDept(d.id);
                  setOverrideStart(null);
                }}
                aria-pressed={dept === d.id}
                className={`rounded-md px-3 py-1 ${dept === d.id ? "bg-white shadow-sm" : "text-ink-500"}`}
              >
                {d.name}
              </button>
            ))}
          </div>
        )}

        {canManage && cols.length > 0 && (
          <button
            onClick={() => setOpenDate(cols[0])}
            className="ml-auto inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-sm font-semibold text-onaccent hover:bg-accent-strong"
          >
            <Icon name="send" size={15} /> Send requests
          </button>
        )}
      </div>

      {/* Window nav */}
      <div className="mb-2 flex items-center justify-between">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-ink-400">
          {startIdx === defaultStart && overrideStart === null ? "Next services" : "Services"}
        </p>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setOverrideStart(Math.max(0, startIdx - 3))}
            disabled={startIdx === 0}
            className="rounded-lg bg-ink-100 px-2.5 py-1 text-sm font-medium text-ink-700 hover:bg-ink-200 disabled:opacity-40"
            aria-label="Earlier services"
          >
            ←
          </button>
          <button
            onClick={() => setOverrideStart(null)}
            className="rounded-lg px-2.5 py-1 text-sm font-medium text-ink-600 hover:bg-ink-100"
          >
            Today
          </button>
          <button
            onClick={() => setOverrideStart(Math.min(maxStart, startIdx + 3))}
            disabled={startIdx >= maxStart}
            className="rounded-lg bg-ink-100 px-2.5 py-1 text-sm font-medium text-ink-700 hover:bg-ink-200 disabled:opacity-40"
            aria-label="Later services"
          >
            →
          </button>
        </div>
      </div>

      {/* Stat strip: the next three service dates */}
      <div className="grid grid-cols-1 divide-y divide-ink-100 rounded-xl border border-ink-100 bg-white sm:grid-cols-3 sm:divide-x sm:divide-y-0">
        {stats.map((s) => (
          <button
            key={s.date}
            onClick={() => setOpenDate(s.date)}
            className="px-4 py-3 text-left transition hover:bg-ink-50"
            title="See this day's plans"
          >
            <p className="text-[10px] font-semibold uppercase tracking-wide text-ink-400">{kicker(s.date)}</p>
            <p className="font-display text-[26px] font-bold leading-tight text-ink-900">
              {s.accepted} / {s.total}
            </p>
            <p className={`truncate text-xs ${s.line.attention ? "font-medium text-brand-700" : "text-ink-500"}`}>
              {s.line.text}
            </p>
          </button>
        ))}
        {Array.from({ length: 3 - stats.length }, (_, i) => (
          <div key={`empty-${i}`} className="px-4 py-3">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-ink-400">—</p>
            <p className="font-display text-[26px] font-bold leading-tight text-ink-400">—</p>
            <p className="text-xs text-ink-500">no service planned</p>
          </div>
        ))}
      </div>

      {/* The matrix */}
      <div className="mt-4 overflow-x-auto rounded-xl border border-ink-100 bg-white">
        <table className="w-full min-w-[560px] border-collapse text-left">
          <thead>
            <tr className="border-b border-ink-100">
              <th className="px-4 py-2.5 text-[10px] font-semibold uppercase tracking-wide text-ink-400">Person</th>
              <th className="px-4 py-2.5 text-[10px] font-semibold uppercase tracking-wide text-ink-400">Position</th>
              {cols.map((date) => (
                <th key={date} className="px-4 py-2.5 text-[10px] font-semibold uppercase tracking-wide text-ink-400">
                  {kicker(date)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-ink-100">
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="whitespace-nowrap px-4 py-2 text-sm font-medium text-ink-900">{r.name}</td>
                <td className="px-4 py-2 text-xs text-ink-500">{r.positions}</td>
                {cols.map((date) => (
                  <td key={date} className="whitespace-nowrap px-4 py-2">
                    {r.perDate[date] ? <StatusTag status={r.perDate[date]} /> : <span className="text-ink-400">—</span>}
                  </td>
                ))}
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={2 + Math.max(cols.length, 1)} className="px-4 py-10 text-center text-sm text-ink-400">
                  {cols.length === 0
                    ? "No services planned yet."
                    : canManage
                      ? "Nobody is scheduled on these dates yet — pick a date above to send requests."
                      : "Nobody is scheduled on these dates yet."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {openDate && (
        <DayPanel
          date={openDate}
          plans={byDate[openDate] ?? []}
          people={people}
          blockouts={blockouts}
          patterns={patterns}
          canManage={canManage}
          currentProfileId={currentProfileId}
          onClose={() => setOpenDate(null)}
          onAssigned={(planId, row) =>
            setPlans((ps) =>
              ps.map((p) => (p.id === planId ? { ...p, assignments: [...p.assignments, row] } : p)),
            )
          }
        />
      )}
    </div>
  );
}

/**
 * The day drawer.
 *
 * Declared at module scope, NOT inside ScheduleMatrix. Nested, it was a new
 * function identity on every parent render, so React unmounted and remounted
 * it — wiping the plan, position and person a volunteer had already chosen
 * partway through assigning someone.
 */
function DayPanel({
  date,
  plans: dayPlans,
  people,
  blockouts,
  patterns,
  canManage,
  currentProfileId,
  onClose,
  onAssigned,
}: {
  date: string;
  plans: SchedulePlan[];
  people: { id: string; full_name: string }[];
  blockouts: Blockout[];
  patterns: ServingPattern[];
  canManage: boolean;
  currentProfileId: string;
  onClose: () => void;
  onAssigned: (planId: string, row: SchedulePlan["assignments"][number]) => void;
}) {
  const supabase = createClient();
  const [planId, setPlanId] = useState(dayPlans[0]?.id ?? "");
  const [position, setPosition] = useState("");
  const [person, setPerson] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dateObj = new Date(date + "T00:00:00");

  // Availability warning shown next to each name.
  function label(id: string) {
    const a = availabilityFor(id, dateObj, blockouts, patterns);
    if (a.state === "blocked") return ` — away (${a.reason})`;
    if (a.state === "off-pattern") return ` — ${a.reason}`;
    return "";
  }

  async function assign(e: React.FormEvent) {
    e.preventDefault();
    if (!planId || !position.trim()) return;
    setBusy(true);
    setError(null);
    const { data, error } = await supabase
      .from("plan_assignments")
      .insert({
        plan_id: planId,
        position: position.trim(),
        profile_id: person || null,
        status: "invited",
      })
      .select("id, position, profile_id, status")
      .single();
    setBusy(false);
    if (error) return setError(error.message);

    const name = people.find((p) => p.id === person)?.full_name ?? null;
    onAssigned(planId, { ...(data as { id: string; position: string; profile_id: string | null; status: "invited" }), name });

    if (person && person !== currentProfileId) {
      const plan = dayPlans.find((p) => p.id === planId);
      notify(
        person,
        "You've been scheduled",
        `${plan?.title ?? "Service"} — ${position.trim()} on ${dateObj.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" })}`,
        `/services/${planId}`,
      );
    }
    setPosition("");
    setPerson("");
  }

  return (
    <Modal onClose={onClose} align="end" className="sm:items-center sm:p-4" label="Service plan">
      <div
        className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-t-2xl bg-white sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-ink-100 px-5 py-4">
          <h2 className="font-display text-lg font-bold">
            {dateObj.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}
          </h2>
          <button onClick={onClose} aria-label="Close" className="text-ink-400 hover:text-ink-700">
            <Icon name="x" />
          </button>
        </div>

        <div className="space-y-4 p-5">
          {dayPlans.length === 0 ? (
            <p className="rounded-xl border border-dashed border-ink-200 px-4 py-8 text-center text-sm text-ink-400">
              Nothing scheduled this day.
            </p>
          ) : (
            dayPlans.map((p) => (
              <div key={p.id} className="rounded-xl border border-ink-100 p-3">
                <Link href={`/services/${p.id}`} className="font-display font-semibold text-ink-900 hover:text-brand-600">
                  {p.title}
                </Link>
                <div className="mt-2 space-y-1">
                  {p.assignments.map((a) => (
                    <div key={a.id} className="flex items-center gap-2 text-sm">
                      <span className="font-medium text-ink-700">{a.position}</span>
                      <span className="text-ink-500">{a.name ?? "unassigned"}</span>
                      <span className="ml-auto">
                        <StatusTag status={a.status} />
                      </span>
                    </div>
                  ))}
                  {p.assignments.length === 0 && (
                    <p className="text-sm text-ink-400">Nobody scheduled yet.</p>
                  )}
                </div>
              </div>
            ))
          )}

          {canManage && dayPlans.length > 0 && (
            <form onSubmit={assign} className="space-y-2 rounded-xl border border-ink-100 bg-ink-50 p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-ink-400">
                Schedule someone
              </p>
              {dayPlans.length > 1 && (
                <select className="ah-input" value={planId} onChange={(e) => setPlanId(e.target.value)}>
                  {dayPlans.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.title}
                    </option>
                  ))}
                </select>
              )}
              <input
                className="ah-input"
                placeholder="Position (e.g. Sound, Acoustic Guitar)"
                value={position}
                onChange={(e) => setPosition(e.target.value)}
              />
              <select className="ah-input" value={person} onChange={(e) => setPerson(e.target.value)}>
                <option value="">Assign later</option>
                {people.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.full_name}
                    {label(p.id)}
                  </option>
                ))}
              </select>
              {error && <p className="rounded-lg bg-brand-50 px-3 py-2 text-sm text-brand-700">{error}</p>}
              <button
                type="submit"
                disabled={busy || !position.trim()}
                className="w-full rounded-lg bg-accent py-2 text-sm font-semibold text-onaccent hover:bg-accent-strong disabled:opacity-60"
              >
                {busy ? "Sending…" : "Send request"}
              </button>
            </form>
          )}
        </div>
      </div>
    </Modal>
  );
}
