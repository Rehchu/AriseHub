import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  FollowUpBoard,
  type Alert,
  type Card,
  type Stage,
} from "@/components/followup/FollowUpBoard";

export const metadata = { title: "Follow-up" };

// Staff and department leads only: this is people's contact details and the
// fact somebody has stopped coming, which is not congregation-wide information.
export default async function FollowUpPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, role")
    .eq("user_id", user!.id)
    .single();
  const me = profile as { id: string; role: string } | null;
  const canManage = me?.role === "Super_Admin" || me?.role === "Staff";
  const { data: leads } = await supabase.rpc("is_any_department_lead");
  if (!canManage && !leads) redirect("/dashboard");

  const [{ data: stages }, { data: cards }, { data: alerts }, { data: people }] =
    await Promise.all([
      supabase.from("pipeline_stages").select("id, pipeline_id, position, name, stall_days").order("position"),
      supabase
        .from("pipeline_cards")
        .select(
          "id, pipeline_id, stage_id, person_id, person_name, contact, assigned_to, entered_stage_at, notes, closed_at, person:profiles!pipeline_cards_person_id_fkey(full_name), owner:profiles!pipeline_cards_assigned_to_fkey(full_name)",
        )
        .is("closed_at", null),
      supabase
        .from("attendance_alerts")
        .select("id, person_id, baseline, weeks_absent, status, flagged_at, person:profiles!attendance_alerts_person_id_fkey(full_name)")
        .in("status", ["new", "assigned"])
        .order("weeks_absent", { ascending: false }),
      supabase.from("people_directory").select("id, full_name").is("archived_at", null).order("full_name").limit(300),
    ]);

  return (
    <FollowUpBoard
      stages={(stages ?? []) as Stage[]}
      cards={(cards ?? []) as unknown as Card[]}
      alerts={(alerts ?? []) as unknown as Alert[]}
      people={(people ?? []) as { id: string; full_name: string }[]}
      canManage={canManage}
      currentProfileId={me?.id ?? ""}
    />
  );
}
