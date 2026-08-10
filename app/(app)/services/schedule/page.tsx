import { createClient } from "@/lib/supabase/server";
import { ScheduleViews } from "@/components/services/ScheduleViews";
import type { SchedulePlan } from "@/components/services/ScheduleMatrix";
import type { Blockout, ServingPattern } from "@/lib/availability";

export default async function SchedulePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: profile } = await supabase
    .from("profiles")
    .select("id, role")
    .eq("user_id", user!.id)
    .single();
  const profileId = (profile as { id: string } | null)?.id ?? "";
  const role = (profile as { role?: string } | null)?.role;
  const canManage = role === "Super_Admin" || role === "Staff";

  // A scheduling calendar only ever shows dates near today, so only load those.
  //
  // This asked for every service plan ever, ascending, with no limit — and
  // PostgREST caps a response at 1000 rows. Past that the page would quietly
  // start showing the church's OLDEST thousand Sundays and nothing since, with
  // no error. Same shape of bug as the message thread that showed its first 200
  // messages forever.
  const window = (weeks: number) => {
    const d = new Date();
    d.setDate(d.getDate() + weeks * 7);
    return d.toISOString().slice(0, 10);
  };
  const from = window(-8);
  const to = window(26);

  const [
    { data: plans },
    { data: assignments },
    { data: departments },
    { data: myDepts },
    { data: people },
    { data: blockouts },
    { data: patterns },
  ] = await Promise.all([
    supabase
      .from("service_plans")
      .select("id, title, service_date, department_id")
      .gte("service_date", from)
      .lte("service_date", to)
      .order("service_date"),
    // Assignments are per-plan, so they inherit the same ceiling. Scoped by the
    // same date window through the embedded plan.
    supabase
      .from("plan_assignments")
      .select(
        "id, plan_id, position, profile_id, status, assignee:profiles!plan_assignments_profile_id_fkey(full_name), plan:service_plans!inner(service_date)",
      )
      .gte("plan.service_date", from)
      .lte("plan.service_date", to),
    supabase.from("departments").select("id, name").order("name"),
    supabase.from("department_members").select("department_id").eq("profile_id", profileId),
    canManage
      ? supabase.from("profiles").select("id, full_name").is("archived_at", null).order("full_name").limit(300)
      : Promise.resolve({ data: [] as { id: string; full_name: string }[] }),
    // Blockouts that ended before the window began cannot affect it.
    supabase
      .from("blockout_dates")
      .select("id, profile_id, starts_on, ends_on, reason")
      .gte("ends_on", from),
    supabase.from("serving_patterns").select("id, profile_id, weekday, weeks, note"),
  ]);

  // Attach assignments to their plan.
  const byPlan: Record<string, SchedulePlan["assignments"]> = {};
  for (const a of (assignments ?? []) as unknown as Array<{
    id: string;
    plan_id: string;
    position: string;
    profile_id: string | null;
    status: string;
    assignee: { full_name: string } | { full_name: string }[] | null;
  }>) {
    const who = Array.isArray(a.assignee) ? a.assignee[0] : a.assignee;
    (byPlan[a.plan_id] ??= []).push({
      id: a.id,
      position: a.position,
      profile_id: a.profile_id,
      status: a.status as "invited" | "accepted" | "declined",
      name: who?.full_name ?? null,
    });
  }

  const rows: SchedulePlan[] = ((plans ?? []) as Array<{
    id: string;
    title: string;
    service_date: string;
    department_id: string | null;
  }>).map((p) => ({ ...p, assignments: byPlan[p.id] ?? [] }));

  return (
    <ScheduleViews
      plans={rows}
      departments={(departments ?? []) as { id: string; name: string }[]}
      myDepartmentIds={((myDepts ?? []) as { department_id: string }[]).map((d) => d.department_id)}
      people={(people ?? []) as { id: string; full_name: string }[]}
      blockouts={(blockouts ?? []) as Blockout[]}
      patterns={(patterns ?? []) as ServingPattern[]}
      canManage={canManage}
      currentProfileId={profileId}
      today={new Date().toISOString().slice(0, 10)}
    />
  );
}
