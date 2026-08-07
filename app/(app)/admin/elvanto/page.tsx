import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ElvantoSync, type SyncRun } from "@/components/admin/ElvantoSync";

export default async function ElvantoPage() {
  const supabase = await createClient();

  // Integrations are Super_Admin / IT only — Staff can reach /admin for Rooms.
  const {
    data: { user: guardUser },
  } = await supabase.auth.getUser();
  const { data: guardProfile } = await supabase
    .from("profiles")
    .select("role")
    .eq("user_id", guardUser!.id)
    .single();
  const guardRole = (guardProfile as { role?: string } | null)?.role;
  if (guardRole !== "Super_Admin" && guardRole !== "IT_Admin") redirect("/dashboard");

  const { data: runs } = await supabase
    .from("elvanto_syncs")
    .select(
      "id, started_at, finished_at, status, people_created, people_updated, groups_created, groups_updated, errors",
    )
    .order("started_at", { ascending: false })
    .limit(10);

  const { count: linked } = await supabase
    .from("profiles")
    .select("*", { count: "exact", head: true })
    .not("elvanto_id", "is", null);

  return (
    <ElvantoSync
      runs={(runs ?? []) as SyncRun[]}
      linkedCount={linked ?? 0}
      configured={!!process.env.ELVANTO_API_KEY}
    />
  );
}
