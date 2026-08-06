import { createClient } from "@/lib/supabase/server";
import { CampusesAdmin } from "@/components/admin/CampusesAdmin";
import type { Campus } from "@/lib/database.types";

export default async function CampusesAdminPage() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("campuses")
    .select("id, name, external_id, created_at, updated_at")
    .order("name");

  return <CampusesAdmin initial={(data ?? []) as Campus[]} />;
}
