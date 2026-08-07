import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PeopleAdmin, type PersonFieldDef } from "@/components/admin/PeopleAdmin";
import type { Campus, Department, Profile } from "@/lib/database.types";

export default async function PeopleAdminPage() {
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


  const [
    { data: profiles },
    { data: departments },
    { data: campuses },
    { data: memberships },
    { data: fields },
    { data: values },
  ] = await Promise.all([
    supabase
      .from("profiles")
      .select(
        "id, user_id, full_name, email, phone, photo_url, role, campus_id, is_checkin_lead, archived_at, created_at, updated_at",
      )
      .order("full_name"),
    supabase.from("departments").select("id, name, slug").order("name"),
    supabase.from("campuses").select("id, name").order("name"),
    supabase.from("department_members").select("department_id, profile_id, role"),
    supabase.from("person_fields").select("id, label, field_type, options, sort_order").order("sort_order"),
    supabase.from("person_field_values").select("profile_id, field_id, value"),
  ]);

  // profile_id -> { field_id -> value }
  const valueMap: Record<string, Record<string, string>> = {};
  for (const v of (values ?? []) as { profile_id: string; field_id: string; value: string | null }[]) {
    (valueMap[v.profile_id] ??= {})[v.field_id] = v.value ?? "";
  }

  // profile_id -> department_id[] , and profile_id -> { department_id: role }
  const memberMap: Record<string, string[]> = {};
  const leadMap: Record<string, Record<string, string>> = {};
  for (const m of (memberships ?? []) as {
    department_id: string;
    profile_id: string;
    role: string;
  }[]) {
    (memberMap[m.profile_id] ??= []).push(m.department_id);
    (leadMap[m.profile_id] ??= {})[m.department_id] = m.role;
  }

  return (
    <PeopleAdmin
      profiles={(profiles ?? []) as Profile[]}
      departments={(departments ?? []) as Department[]}
      campuses={(campuses ?? []) as Campus[]}
      memberMap={memberMap}
      leadMap={leadMap}
      fields={(fields ?? []) as PersonFieldDef[]}
      valueMap={valueMap}
    />
  );
}
