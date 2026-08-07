import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { CampusesAdmin } from "@/components/admin/CampusesAdmin";
import type { Campus } from "@/lib/database.types";

export default async function CampusesAdminPage() {
  const supabase = await createClient();
  // Super_Admin only — the layout also admits IT_Admin for integrations.
  const {
    data: { user: guardUser },
  } = await supabase.auth.getUser();
  const { data: guardProfile } = await supabase
    .from("profiles")
    .select("role")
    .eq("user_id", guardUser!.id)
    .single();
  if ((guardProfile as { role?: string } | null)?.role !== "Super_Admin") {
    redirect("/dashboard");
  }

  const { data } = await supabase
    .from("campuses")
    .select("id, name, external_id, created_at, updated_at")
    .order("name");

  return <CampusesAdmin initial={(data ?? []) as Campus[]} />;
}
