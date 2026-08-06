import { createClient } from "@/lib/supabase/server";
import { FieldsAdmin, type PersonField } from "@/components/admin/FieldsAdmin";

export default async function FieldsAdminPage() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("person_fields")
    .select("id, label, field_type, options, sort_order")
    .order("sort_order");
  return <FieldsAdmin initial={(data ?? []) as PersonField[]} />;
}
