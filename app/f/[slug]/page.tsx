import { createClient } from "@/lib/supabase/server";
import { PublicForm, type PublicField } from "@/components/forms/PublicForm";
import { Logo } from "@/components/Logo";

// Public, no-login Connect Card page. RLS (forms_select_anon / form_fields_
// select_anon) only exposes ACTIVE forms + their fields to the anon role.
export default async function PublicFormPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const supabase = await createClient();

  const { data: form } = await supabase
    .from("forms")
    .select("id, title, description, is_active")
    .eq("slug", slug)
    .maybeSingle();

  if (!form || !(form as { is_active: boolean }).is_active) {
    return (
      <Shell>
        <p className="text-center text-ink-500">
          This form isn&apos;t available right now.
        </p>
      </Shell>
    );
  }

  const { data: fields } = await supabase
    .from("form_fields")
    .select("id, label, field_type, options, required, sort_order")
    .eq("form_id", (form as { id: string }).id)
    .order("sort_order");

  return (
    <Shell>
      <PublicForm
        formId={(form as { id: string }).id}
        title={(form as { title: string }).title}
        description={(form as { description: string | null }).description}
        fields={(fields ?? []) as PublicField[]}
      />
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col items-center bg-ink-50 px-4 py-10">
      <div className="mb-6 flex items-center gap-2 text-ink-800">
        <Logo size={28} />
        <span className="font-display text-lg font-bold">
          Arise<span className="text-brand-500">Hub</span>
        </span>
      </div>
      <div className="w-full max-w-md">{children}</div>
      <p className="mt-8 text-xs text-ink-400">Arise Church · Pineville, LA</p>
    </div>
  );
}
