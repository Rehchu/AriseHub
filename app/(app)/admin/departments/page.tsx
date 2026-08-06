import { createClient } from "@/lib/supabase/server";
import { DepartmentsAdmin } from "@/components/admin/DepartmentsAdmin";
import type { Department } from "@/lib/database.types";

export default async function DepartmentsAdminPage() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("departments")
    .select("id, name, slug, description, campus_id, created_at, updated_at")
    .order("name");

  // Member counts per department (visible to authenticated via RLS).
  const { data: members } = await supabase
    .from("department_members")
    .select("department_id");
  const counts: Record<string, number> = {};
  for (const m of (members ?? []) as { department_id: string }[]) {
    counts[m.department_id] = (counts[m.department_id] ?? 0) + 1;
  }

  return (
    <DepartmentsAdmin
      initial={(data ?? []) as Department[]}
      counts={counts}
    />
  );
}
