import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PlanDetail, type Item, type Assignment } from "@/components/services/PlanDetail";
import type { Blockout, ServingPattern } from "@/lib/availability";

export default async function PlanPage({
  params,
}: {
  params: Promise<{ planId: string }>;
}) {
  const { planId } = await params;
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

  const { data: plan } = await supabase
    .from("service_plans")
    .select("id, title, service_date, notes, department:departments(name)")
    .eq("id", planId)
    .maybeSingle();
  if (!plan) notFound();

  const dept = (plan as { department?: { name: string } | { name: string }[] | null }).department;
  const departmentName = (Array.isArray(dept) ? dept[0]?.name : dept?.name) ?? null;

  const [{ data: items }, { data: assignments }, { data: people }] = await Promise.all([
    supabase
      .from("plan_items")
      .select("id, sort_order, title, item_type, duration_minutes, notes, song_key")
      .eq("plan_id", planId)
      .order("sort_order"),
    supabase
      .from("plan_assignments")
      .select("id, position, profile_id, status, assignee:profiles!plan_assignments_profile_id_fkey(full_name)")
      .eq("plan_id", planId),
    canManage
      ? supabase.from("profiles").select("id, full_name").is("archived_at", null).order("full_name").limit(300)
      : Promise.resolve({ data: [] as { id: string; full_name: string }[] }),
  ]);

  // Availability signals + who is already serving on this date (any plan), so
  // the scheduler is warned before double-booking someone.
  const planDate = (plan as { service_date: string }).service_date;
  const [{ data: songs }, { data: blockouts }, { data: patterns }, { data: sameDay }] = await Promise.all([
    supabase.from("songs").select("id, title, artist, default_key").eq("archived", false).order("title"),
    supabase.from("blockout_dates").select("id, profile_id, starts_on, ends_on, reason"),
    supabase.from("serving_patterns").select("id, profile_id, weekday, weeks, note"),
    supabase
      .from("plan_assignments")
      .select("profile_id, position, service_plans!inner(service_date, title)")
      .eq("service_plans.service_date", planDate)
      .neq("plan_id", planId),
  ]);

  const alreadyServing: Record<string, string> = {};
  for (const a of (sameDay ?? []) as unknown as {
    profile_id: string | null;
    position: string;
    service_plans: { title: string } | { title: string }[] | null;
  }[]) {
    if (!a.profile_id) continue;
    const sp = Array.isArray(a.service_plans) ? a.service_plans[0] : a.service_plans;
    alreadyServing[a.profile_id] = (sp?.title ?? "another plan") + " — " + a.position;
  }

  const normAssignments: Assignment[] = ((assignments ?? []) as unknown as Array<
    Omit<Assignment, "assignee"> & { assignee: { full_name: string }[] | { full_name: string } | null }
  >).map((a) => ({
    ...a,
    assignee: Array.isArray(a.assignee) ? (a.assignee[0] ?? null) : a.assignee,
  }));

  return (
    <PlanDetail
      plan={plan as unknown as { id: string; title: string; service_date: string; notes: string | null }}
      departmentName={departmentName}
      initialItems={(items ?? []) as Item[]}
      initialAssignments={normAssignments}
      people={(people ?? []) as { id: string; full_name: string }[]}
      songs={(songs ?? []) as { id: string; title: string; artist: string | null; default_key: string | null }[]}
      canManage={canManage}
      currentProfileId={profileId}
      blockouts={(blockouts ?? []) as Blockout[]}
      patterns={(patterns ?? []) as ServingPattern[]}
      alreadyServing={alreadyServing}
    />
  );
}
