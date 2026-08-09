import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { StatStrip, StatCell } from "@/components/dashboard/StatStrip";

// A single reporting surface. Every query runs under the viewer's RLS, so a
// Staff member only aggregates what they can see; Super_Admin sees church-wide.
export default async function ReportsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("user_id", user!.id)
    .single();
  const role = (profile as { role?: string } | null)?.role;
  if (role !== "Super_Admin" && role !== "Staff") redirect("/dashboard");

  const today = new Date().toISOString().slice(0, 10);
  const n = (r: { count: number | null }) => r.count ?? 0;

  const [
    peopleBreakdown,
    campuses,
    groupsCount,
    groupMembers,
    departmentsCount,
    tasksOpen,
    tasksDone,
    upcomingPlans,
    submissions,
  ] = await Promise.all([
    // Counted in the database, not here (0057).
    //
    // This fetched every profile row and tallied them in JavaScript — and
    // PostgREST caps a response at 1000 rows. "People: 1000" was not a
    // milestone, it was the ceiling, and every role and campus breakdown was
    // wrong alongside it. The function is SECURITY INVOKER, so RLS still scopes
    // the totals to what the viewer may see.
    supabase.rpc("report_people_breakdown"),
    supabase.from("campuses").select("id, name"),
    supabase.from("groups").select("*", { count: "exact", head: true }),
    supabase.from("group_members").select("*", { count: "exact", head: true }),
    supabase.from("departments").select("*", { count: "exact", head: true }),
    supabase.from("tasks").select("*", { count: "exact", head: true }).neq("status", "done"),
    supabase.from("tasks").select("*", { count: "exact", head: true }).eq("status", "done"),
    supabase.from("service_plans").select("*", { count: "exact", head: true }).gte("service_date", today),
    supabase.from("form_submissions").select("*", { count: "exact", head: true }),
  ]);

  const breakdown = (peopleBreakdown.data ?? []) as {
    role: string;
    campus_id: string | null;
    n: number;
  }[];

  // Trends: check-in attendance and new people over the last 8 weeks. Leadership
  // asks "are we growing?" far more often than "how many rows are there".
  // Grouped in the database for the same reason as the head-count above — a
  // busy eight weeks of check-ins comfortably exceeds the row cap.
  const eightWeeksAgo = new Date(Date.now() - 56 * 24 * 60 * 60 * 1000).toISOString();
  const [{ data: checkinWeeks }, { data: newPeopleWeeks }] = await Promise.all([
    supabase.rpc("report_checkins_weekly", { p_since: eightWeeksAgo }),
    supabase.rpc("report_new_people_weekly", { p_since: eightWeeksAgo }),
  ]);

  /** Fill the eight Sunday-anchored buckets the chart draws, in order. */
  function weekly(rows: { week: string; n: number }[] | null) {
    const byWeek = new Map((rows ?? []).map((r) => [r.week, Number(r.n)]));
    const out: { week: string; count: number }[] = [];
    for (let i = 7; i >= 0; i--) {
      const d = new Date(Date.now() - i * 7 * 24 * 60 * 60 * 1000);
      d.setDate(d.getDate() - d.getDay());
      const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      out.push({ week: k, count: byWeek.get(k) ?? 0 });
    }
    return out;
  }

  const attendanceTrend = weekly(checkinWeeks as { week: string; n: number }[] | null);
  const growthTrend = weekly(newPeopleWeeks as { week: string; n: number }[] | null);

  const byRole: Record<string, number> = {};
  const byCampus: Record<string, number> = {};
  const campusName: Record<string, string> = {};
  for (const c of (campuses.data ?? []) as { id: string; name: string }[]) campusName[c.id] = c.name;
  let peopleTotal = 0;
  for (const b of breakdown) {
    const count = Number(b.n);
    peopleTotal += count;
    byRole[b.role] = (byRole[b.role] ?? 0) + count;
    const key = b.campus_id ? campusName[b.campus_id] ?? "Unknown" : "No campus";
    byCampus[key] = (byCampus[key] ?? 0) + count;
  }

  // Grid-position borders for a 7-cell strip: 2-up small, 4-up large.
  const cell = [
    "",
    "border-l border-ink-100",
    "border-t border-ink-100 lg:border-l lg:border-t-0",
    "border-l border-t border-ink-100 lg:border-t-0",
    "border-t border-ink-100",
    "border-l border-t border-ink-100",
    "border-t border-ink-100 lg:border-l",
  ];

  const open = n(tasksOpen);
  const plans = n(upcomingPlans);

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 border-b border-ink-100 pb-4">
        <h1 className="font-display text-2xl font-bold text-ink-900">Reports</h1>
        <p className="text-sm text-ink-500">A church-wide snapshot across every module.</p>
      </div>

      <div className="mt-5">
        <StatStrip>
          <StatCell
            className={cell[0]}
            kicker="People"
            value={String(peopleTotal)}
            status="in the directory"
          />
          <StatCell
            className={cell[1]}
            kicker="Groups"
            value={String(n(groupsCount))}
            status={`${n(groupMembers)} memberships`}
          />
          <StatCell
            className={cell[2]}
            kicker="Open tasks"
            value={String(open)}
            status={`${n(tasksDone)} done`}
            attention={open > 0}
          />
          <StatCell
            className={cell[3]}
            kicker="Upcoming plans"
            value={String(plans)}
            status={plans > 0 ? "on the calendar" : "none scheduled"}
            attention={plans === 0}
          />
          <StatCell
            className={cell[4]}
            kicker="Form submissions"
            value={String(n(submissions))}
            status="all-time responses"
          />
          <StatCell
            className={cell[5]}
            kicker="Departments"
            value={String(n(departmentsCount))}
            status="serving teams"
          />
          <StatCell
            className={cell[6]}
            kicker="Campuses"
            value={String((campuses.data ?? []).length)}
            status="locations"
          />
        </StatStrip>
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <Trend title="Check-ins — last 8 weeks" data={attendanceTrend} />
        <Trend title="New people — last 8 weeks" data={growthTrend} />
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <Breakdown title="People by role" data={byRole} />
        <Breakdown title="People by campus" data={byCampus} />
      </div>
    </div>
  );
}

/** Compact weekly bar chart — enough to see a direction at a glance. */
function Trend({ title, data }: { title: string; data: { week: string; count: number }[] }) {
  const max = Math.max(1, ...data.map((d) => d.count));
  const total = data.reduce((s, d) => s + d.count, 0);
  return (
    <div className="rounded-xl border border-ink-100 bg-white p-5">
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h2 className="font-display font-semibold text-ink-900">{title}</h2>
        <span className="text-xs text-ink-500">{total} total</span>
      </div>
      {total === 0 ? (
        <p className="text-sm text-ink-400">No data yet.</p>
      ) : (
        <div className="flex h-24 items-end gap-1.5">
          {data.map((d) => (
            <div key={d.week} className="flex flex-1 flex-col items-center gap-1">
              <div
                className={`w-full rounded-t ${d.count === 0 ? "bg-ink-100" : "bg-accent"}`}
                style={{ height: Math.max(2, (d.count / max) * 72) }}
                title={d.week + ": " + d.count}
              />
              <span className="text-[9px] text-ink-400">
                {new Date(d.week + "T00:00:00").toLocaleDateString(undefined, { month: "numeric", day: "numeric" })}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Breakdown({ title, data }: { title: string; data: Record<string, number> }) {
  const entries = Object.entries(data).sort((a, b) => b[1] - a[1]);
  const max = Math.max(1, ...entries.map(([, v]) => v));
  return (
    <div className="rounded-xl border border-ink-100 bg-white p-5">
      <h2 className="mb-3 font-display font-semibold text-ink-900">{title}</h2>
      {entries.length === 0 ? (
        <p className="text-sm text-ink-400">No data yet.</p>
      ) : (
        <div className="space-y-2">
          {entries.map(([k, v]) => (
            <div key={k}>
              <div className="mb-0.5 flex justify-between text-sm">
                <span className="text-ink-600">{k.replace("_", " ")}</span>
                <span className="font-medium text-ink-800">{v}</span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-ink-100">
                <div className="h-full rounded-full bg-brand-500" style={{ width: `${(v / max) * 100}%` }} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
