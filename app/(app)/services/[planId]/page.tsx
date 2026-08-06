import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PlanDetail, type Item, type Assignment } from "@/components/services/PlanDetail";

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
    .select("id, title, service_date, notes")
    .eq("id", planId)
    .maybeSingle();
  if (!plan) notFound();

  const [{ data: items }, { data: assignments }, { data: people }] = await Promise.all([
    supabase
      .from("plan_items")
      .select("id, sort_order, title, item_type, duration_minutes, notes")
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

  const normAssignments: Assignment[] = ((assignments ?? []) as unknown as Array<
    Omit<Assignment, "assignee"> & { assignee: { full_name: string }[] | { full_name: string } | null }
  >).map((a) => ({
    ...a,
    assignee: Array.isArray(a.assignee) ? (a.assignee[0] ?? null) : a.assignee,
  }));

  return (
    <PlanDetail
      plan={plan as { id: string; title: string; service_date: string; notes: string | null }}
      initialItems={(items ?? []) as Item[]}
      initialAssignments={normAssignments}
      people={(people ?? []) as { id: string; full_name: string }[]}
      canManage={canManage}
      currentProfileId={profileId}
    />
  );
}
