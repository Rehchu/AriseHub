import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { FormBuilder, type Field, type Submission } from "@/components/forms/FormBuilder";

export default async function FormBuilderPage({
  params,
}: {
  params: Promise<{ formId: string }>;
}) {
  const { formId } = await params;
  const supabase = await createClient();

  const { data: form } = await supabase
    .from("forms")
    .select("id, title, slug, description, is_active")
    .eq("id", formId)
    .maybeSingle();
  if (!form) notFound();

  const [{ data: fields }, { data: submissions }] = await Promise.all([
    supabase
      .from("form_fields")
      .select("id, label, field_type, options, required, sort_order")
      .eq("form_id", formId)
      .order("sort_order"),
    supabase
      .from("form_submissions")
      .select("id, submitter_name, data, created_at")
      .eq("form_id", formId)
      .order("created_at", { ascending: false }),
  ]);

  return (
    <FormBuilder
      form={form as { id: string; title: string; slug: string; description: string | null; is_active: boolean }}
      initialFields={(fields ?? []) as Field[]}
      submissions={(submissions ?? []) as Submission[]}
    />
  );
}
