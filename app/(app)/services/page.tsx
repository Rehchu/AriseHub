import { createClient } from "@/lib/supabase/server";
import { PlansList, type PlanRow } from "@/components/services/PlansList";

export default async function ServicesPage() {
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

  // RLS returns all plans for services staff, or only plans you're scheduled on.
  const { data: plans } = await supabase
    .from("service_plans")
    .select("id, title, service_date")
    .order("service_date", { ascending: false });

  const { data: departments } = await supabase
    .from("departments")
    .select("id, name")
    .order("name");

  const { data: myAssignments } = await supabase
    .from("plan_assignments")
    .select("plan_id, status")
    .eq("profile_id", profileId);
  const myStatus: Record<string, string> = {};
  for (const a of (myAssignments ?? []) as { plan_id: string; status: string }[]) {
    myStatus[a.plan_id] = a.status;
  }

  const rows: PlanRow[] = ((plans ?? []) as Array<Omit<PlanRow, "myStatus">>).map((p) => ({
    ...p,
    myStatus: myStatus[p.id] ?? null,
  }));

  return (
    <PlansList
      initial={rows}
      canManage={canManage}
      currentProfileId={profileId}
      departments={(departments ?? []) as { id: string; name: string }[]}
    />
  );
}
