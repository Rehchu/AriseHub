"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Icon } from "@/components/shell/Icon";
import { notify } from "@/lib/notify";
import { availabilityFor, type Blockout, type ServingPattern } from "@/lib/availability";

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

const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const STATUS_DOT: Record<string, string> = {
  accepted: "bg-emerald-500",
  invited: "bg-amber-500",
  declined: "bg-ink-300",
};

function ymd(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function startOfWeek(d: Date) {
  const x = new Date(d);
  x.setDate(x.getDate() - x.getDay());
  x.setHours(0, 0, 0, 0);
  return x;
}

/**
 * Scheduling calendar. Month and week views over service plans, filtered by
 * department so each team sees only their own rota. Click a day to see who's
 * serving — and, if you run services, to assign someone right there.
 */
export function ScheduleCalendar({
  plans: initialPlans,
  departments,
  myDepartmentIds,
  people,
  blockouts,
  patterns,
  canManage,
  currentProfileId,
}: {
  plans: SchedulePlan[];
  departments: { id: string; name: string }[];
  myDepartmentIds: string[];
  people: { id: string; full_name: string }[];
  blockouts: Blockout[];
  patterns: ServingPattern[];
  canManage: boolean;
  currentProfileId: string;
}) {
  const supabase = createClient();
  const [plans, setPlans] = useState(initialPlans);
  const [view, setView] = useState<"month" | "week">("month");
  const [cursor, setCursor] = useState(() => new Date());
  const [dept, setDept] = useState<string>(myDepartmentIds[0] ?? "");
  const [selected, setSelected] = useState<string | null>(null);

  const visible = useMemo(
    () => (dept ? plans.filter((p) => p.department_id === dept) : plans),
    [plans, dept],
  );

  const byDate = useMemo(() => {
    const m: Record<string, SchedulePlan[]> = {};
    for (const p of visible) (m[p.service_date] ??= []).push(p);
    return m;
  }, [visible]);

  // Days rendered in the grid.
  const days = useMemo(() => {
    if (view === "week") {
      const s = startOfWeek(cursor);
      return Array.from({ length: 7 }, (_, i) => {
        const d = new Date(s);
        d.setDate(s.getDate() + i);
        return d;
      });
    }
    const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
    const start = startOfWeek(first);
    return Array.from({ length: 42 }, (_, i) => {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      return d;
    });
  }, [cursor, view]);

  function shift(dir: 1 | -1) {
    const d = new Date(cursor);
    if (view === "week") d.setDate(d.getDate() + dir * 7);
    else d.setMonth(d.getMonth() + dir);
    setCursor(d);
  }

  const heading =
    view === "week"
      ? `Week of ${startOfWeek(cursor).toLocaleDateString(undefined, { month: "long", day: "numeric" })}`
      : cursor.toLocaleDateString(undefined, { month: "long", year: "numeric" });

  const todayStr = ymd(new Date());

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      <Link href="/services" className="mb-4 inline-flex items-center gap-1 text-sm text-ink-500 hover:text-brand-600">
        ← Services
      </Link>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="flex-1">
          <h1 className="font-display text-2xl font-bold text-ink-900">Schedule</h1>
          <p className="mt-1 text-sm text-ink-500">Who&apos;s serving, and when.</p>
        </div>

        <select
          className="ah-input w-auto py-1.5 text-sm"
          value={dept}
          onChange={(e) => setDept(e.target.value)}
        >
          <option value="">All departments</option>
          {departments.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </select>

        <div className="flex rounded-lg bg-ink-100 p-1 text-sm font-medium">
          {(["month", "week"] as const).map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={`rounded-md px-3 py-1 capitalize ${view === v ? "bg-white shadow-sm" : "text-ink-500"}`}
            >
              {v}
            </button>
          ))}
        </div>
      </div>

      <div className="mb-3 flex items-center gap-2">
        <button onClick={() => shift(-1)} className="rounded-lg bg-ink-100 px-3 py-1.5 text-sm font-medium text-ink-700 hover:bg-ink-200">
          ←
        </button>
        <span className="flex-1 text-center font-display font-semibold text-ink-900">{heading}</span>
        <button onClick={() => setCursor(new Date())} className="rounded-lg px-3 py-1.5 text-sm font-medium text-ink-600 hover:bg-ink-100">
          Today
        </button>
        <button onClick={() => shift(1)} className="rounded-lg bg-ink-100 px-3 py-1.5 text-sm font-medium text-ink-700 hover:bg-ink-200">
          →
        </button>
      </div>

      {/* Grid */}
      <div className="overflow-hidden rounded-xl border border-ink-100 bg-white">
        <div className="grid grid-cols-7 border-b border-ink-100 bg-ink-50">
          {DOW.map((d) => (
            <div key={d} className="px-2 py-1.5 text-center text-xs font-semibold uppercase tracking-wide text-ink-400">
              {d}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {days.map((d) => {
            const key = ymd(d);
            const inMonth = view === "week" || d.getMonth() === cursor.getMonth();
            const dayPlans = byDate[key] ?? [];
            const isToday = key === todayStr;
            return (
              <button
                key={key}
                onClick={() => setSelected(key)}
                className={`min-h-20 border-b border-r border-ink-100 p-1.5 text-left align-top transition hover:bg-ink-50 ${
                  view === "week" ? "min-h-40" : ""
                } ${inMonth ? "" : "bg-ink-50/50"} ${selected === key ? "ring-2 ring-inset ring-brand-400" : ""}`}
              >
                <span
                  className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-xs ${
                    isToday ? "bg-brand-500 font-bold text-white" : inMonth ? "text-ink-700" : "text-ink-300"
                  }`}
                >
                  {d.getDate()}
                </span>
                <div className="mt-1 space-y-0.5">
                  {dayPlans.slice(0, view === "week" ? 6 : 2).map((p) => (
                    <div key={p.id} className="truncate rounded bg-pink-50 px-1 py-0.5 text-[10px] font-medium text-pink-700">
                      {p.title}
                      {p.assignments.length > 0 && (
                        <span className="ml-1 text-pink-500">· {p.assignments.length}</span>
                      )}
                    </div>
                  ))}
                  {dayPlans.length > (view === "week" ? 6 : 2) && (
                    <div className="text-[10px] text-ink-400">
                      +{dayPlans.length - (view === "week" ? 6 : 2)} more
                    </div>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {selected && (
        <DayPanel
          date={selected}
          plans={byDate[selected] ?? []}
          people={people}
          blockouts={blockouts}
          patterns={patterns}
          canManage={canManage}
          currentProfileId={currentProfileId}
          onClose={() => setSelected(null)}
          onAssigned={(planId, row) =>
            setPlans((ps) =>
              ps.map((p) => (p.id === planId ? { ...p, assignments: [...p.assignments, row] } : p)),
            )
          }
        />
      )}
    </div>
  );

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
      <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center sm:p-4" onClick={onClose}>
        <div
          className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-t-2xl bg-white sm:rounded-2xl"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between border-b border-ink-100 px-5 py-4">
            <h2 className="font-display text-lg font-bold">
              {dateObj.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}
            </h2>
            <button onClick={onClose} className="text-ink-400 hover:text-ink-700">
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
                        <span className={`h-2 w-2 shrink-0 rounded-full ${STATUS_DOT[a.status]}`} />
                        <span className="font-medium text-ink-700">{a.position}</span>
                        <span className="text-ink-500">{a.name ?? "unassigned"}</span>
                        <span className="ml-auto text-xs capitalize text-ink-400">{a.status}</span>
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
                  className="w-full rounded-lg bg-brand-500 py-2 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-60"
                >
                  {busy ? "Adding…" : "Add to schedule"}
                </button>
              </form>
            )}
          </div>
        </div>
      </div>
    );
  }
}
