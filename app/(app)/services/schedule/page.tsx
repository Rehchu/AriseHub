import { createClient } from "@/lib/supabase/server";
import { ScheduleCalendar, type SchedulePlan } from "@/components/services/ScheduleCalendar";
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
      .order("service_date"),
    supabase
      .from("plan_assignments")
      .select("id, plan_id, position, profile_id, status, assignee:profiles!plan_assignments_profile_id_fkey(full_name)"),
    supabase.from("departments").select("id, name").order("name"),
    supabase.from("department_members").select("department_id").eq("profile_id", profileId),
    canManage
      ? supabase.from("profiles").select("id, full_name").is("archived_at", null).order("full_name").limit(300)
      : Promise.resolve({ data: [] as { id: string; full_name: string }[] }),
    supabase.from("blockout_dates").select("id, profile_id, starts_on, ends_on, reason"),
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
    <ScheduleCalendar
      plans={rows}
      departments={(departments ?? []) as { id: string; name: string }[]}
      myDepartmentIds={((myDepts ?? []) as { department_id: string }[]).map((d) => d.department_id)}
      people={(people ?? []) as { id: string; full_name: string }[]}
      blockouts={(blockouts ?? []) as Blockout[]}
      patterns={(patterns ?? []) as ServingPattern[]}
      canManage={canManage}
      currentProfileId={profileId}
    />
  );
}
