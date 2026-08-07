import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { FieldsAdmin, type PersonField } from "@/components/admin/FieldsAdmin";

export default async function FieldsAdminPage() {
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
    .from("person_fields")
    .select("id, label, field_type, options, sort_order")
    .order("sort_order");
  return <FieldsAdmin initial={(data ?? []) as PersonField[]} />;
}
