import { createClient } from "@/lib/supabase/server";
import { MySchedule, type MyPlan } from "@/components/services/MySchedule";

export default async function MySchedulePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: profile } = await supabase
    .from("profiles")
    .select("id")
    .eq("user_id", user!.id)
    .single();
  const profileId = (profile as { id: string } | null)?.id ?? "";

  // Plans I'm scheduled on (RLS already limits this to mine + any I manage).
  const { data: mine } = await supabase
    .from("plan_assignments")
    .select("plan_id")
    .eq("profile_id", profileId);
  const planIds = [...new Set(((mine ?? []) as { plan_id: string }[]).map((a) => a.plan_id))];

  if (planIds.length === 0) {
    return <MySchedule plans={[]} currentProfileId={profileId} />;
  }

  const [{ data: plans }, { data: assignments }] = await Promise.all([
    supabase
      .from("service_plans")
      .select("id, title, service_date, notes")
      .in("id", planIds)
      .order("service_date"),
    // 0024 lets anyone on a plan see the whole team for it.
    //
    // Names only. This embedded `phone`, which 0030 revoked from the
    // `authenticated` role — so PostgREST refused the WHOLE query, the error
    // was discarded into `const { data: assignments }`, and every plan rendered
    // with an empty team and no clue why. Phone numbers come from
    // people_directory below, which gates them properly.
    supabase
      .from("plan_assignments")
      .select("id, plan_id, position, profile_id, status, assignee:profiles!plan_assignments_profile_id_fkey(full_name)")
      .in("plan_id", planIds),
  ]);

  // Contact numbers for the team, for whoever is allowed to see them.
  // people_directory returns phone as NULL rather than erroring when the caller
  // isn't leadership, so the roster renders either way.
  const teamIds = [
    ...new Set(((assignments ?? []) as { profile_id: string | null }[])
      .map((a) => a.profile_id)
      .filter((id): id is string => !!id)),
  ];
  const phoneById: Record<string, string | null> = {};
  if (teamIds.length) {
    const { data: contacts } = await supabase
      .from("people_directory")
      .select("id, phone")
      .in("id", teamIds);
    for (const c of (contacts ?? []) as { id: string; phone: string | null }[]) {
      phoneById[c.id] = c.phone;
    }
  }

  const byPlan: Record<string, MyPlan["team"]> = {};
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
      phone: a.profile_id ? (phoneById[a.profile_id] ?? null) : null,
    });
  }

  const rows: MyPlan[] = ((plans ?? []) as Array<{
    id: string;
    title: string;
    service_date: string;
    notes: string | null;
  }>).map((p) => ({ ...p, team: byPlan[p.id] ?? [] }));

  return <MySchedule plans={rows} currentProfileId={profileId} />;
}
