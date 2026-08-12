"use client";

import Link from "next/link";

export interface LeaderGroup {
  id: string;
  name: string;
  memberCount: number;
  lastMet: string | null;
}

export interface LeaderAssignment {
  id: string;
  plan_id: string;
  plan_title: string;
  service_date: string;
  position: string;
  status: "invited" | "accepted" | "declined";
}

export interface CampusRollup {
  campus_id: string | null;
  campus: string;
  people: number;
  checkedInToday: number;
  openFollowUps: number;
}

function dateLabel(iso: string) {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

/**
 * The leader's own slice of the church (F13).
 *
 * Small-group and department leaders get buried in admin UIs built for staff.
 * This is deliberately not that: their groups, their next serving date, their
 * pending invitations — and nothing else.
 */
export function LeaderPanel({
  groups,
  assignments,
}: {
  groups: LeaderGroup[];
  assignments: LeaderAssignment[];
}) {
  if (groups.length === 0 && assignments.length === 0) return null;

  const pending = assignments.filter((a) => a.status === "invited");

  return (
    <section className="mt-6 rounded-xl border border-ink-100 bg-white p-4">
      <h2 className="font-display text-lg font-bold text-ink-900">Yours to lead</h2>

      {pending.length > 0 && (
        <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-amber-800">
            Waiting on your answer
          </p>
          <ul className="mt-1 space-y-1">
            {pending.map((a) => (
              <li key={a.id} className="text-sm text-amber-900">
                <Link href={`/services/${a.plan_id}`} className="underline">
                  {a.plan_title}
                </Link>{" "}
                — {a.position}, {dateLabel(a.service_date)}
              </li>
            ))}
          </ul>
        </div>
      )}

      {groups.length > 0 && (
        <div className="mt-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-ink-500">
            Your groups
          </p>
          <ul className="mt-1 space-y-1">
            {groups.map((g) => (
              <li key={g.id} className="flex flex-wrap items-baseline justify-between gap-2">
                <Link
                  href={`/groups/${g.id}`}
                  className="text-sm font-medium text-ink-800 hover:underline"
                >
                  {g.name}
                </Link>
                <span className="text-xs text-ink-400">
                  {g.memberCount} people
                  {g.lastMet
                    ? ` · last met ${new Date(g.lastMet).toLocaleDateString()}`
                    : " · no meetings logged"}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {assignments.filter((a) => a.status === "accepted").length > 0 && (
        <div className="mt-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-ink-500">
            You&apos;re serving
          </p>
          <ul className="mt-1 space-y-1">
            {assignments
              .filter((a) => a.status === "accepted")
              .map((a) => (
                <li key={a.id} className="text-sm text-ink-700">
                  {dateLabel(a.service_date)} — {a.position}
                </li>
              ))}
          </ul>
        </div>
      )}
    </section>
  );
}

/**
 * All campuses at once (F12).
 *
 * Campus-scoped leaders see their own campus everywhere else; this is the
 * apostle's view — the same numbers without the campus filter, so the two
 * campuses can be read side by side rather than by switching back and forth.
 */
export function CampusRollup({ rows }: { rows: CampusRollup[] }) {
  if (rows.length < 2) return null; // one campus needs no comparison

  const total = rows.reduce(
    (acc, r) => ({
      people: acc.people + r.people,
      checkedInToday: acc.checkedInToday + r.checkedInToday,
      openFollowUps: acc.openFollowUps + r.openFollowUps,
    }),
    { people: 0, checkedInToday: 0, openFollowUps: 0 },
  );

  return (
    <section className="mt-6 rounded-xl border border-ink-100 bg-white p-4">
      <h2 className="font-display text-lg font-bold text-ink-900">All campuses</h2>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wide text-ink-400">
              <th className="pb-2 font-semibold">Campus</th>
              <th className="pb-2 text-right font-semibold">People</th>
              <th className="pb-2 text-right font-semibold">In today</th>
              <th className="pb-2 text-right font-semibold">Follow-ups</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.campus_id ?? "none"} className="border-t border-ink-100">
                <td className="py-2 font-medium text-ink-800">{r.campus}</td>
                <td className="py-2 text-right tabular-nums text-ink-700">{r.people}</td>
                <td className="py-2 text-right tabular-nums text-ink-700">{r.checkedInToday}</td>
                <td className="py-2 text-right tabular-nums text-ink-700">{r.openFollowUps}</td>
              </tr>
            ))}
            <tr className="border-t-2 border-ink-200 font-semibold">
              <td className="py-2 text-ink-900">Together</td>
              <td className="py-2 text-right tabular-nums text-ink-900">{total.people}</td>
              <td className="py-2 text-right tabular-nums text-ink-900">{total.checkedInToday}</td>
              <td className="py-2 text-right tabular-nums text-ink-900">{total.openFollowUps}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  );
}
