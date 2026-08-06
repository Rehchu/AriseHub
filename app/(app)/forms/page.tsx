import { createClient } from "@/lib/supabase/server";
import { FormsList, type FormRow } from "@/components/forms/FormsList";

export default async function FormsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: profile } = await supabase
    .from("profiles")
    .select("id")
    .eq("user_id", user!.id)
    .single();
  const profileId = (profile as { id: string } | null)?.id ?? "";

  const { data: forms } = await supabase
    .from("forms")
    .select("id, title, slug, description, is_active, created_at")
    .order("created_at", { ascending: false });

  // Submission counts (RLS returns only submissions for forms you manage).
  const { data: subs } = await supabase.from("form_submissions").select("form_id");
  const counts: Record<string, number> = {};
  for (const s of (subs ?? []) as { form_id: string }[]) {
    counts[s.form_id] = (counts[s.form_id] ?? 0) + 1;
  }

  const rows: FormRow[] = ((forms ?? []) as Array<Omit<FormRow, "submissionCount">>).map((f) => ({
    ...f,
    submissionCount: counts[f.id] ?? 0,
  }));

  return <FormsList initial={rows} currentProfileId={profileId} />;
}
