import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PasswordResetTool } from "@/components/it/PasswordResetTool";

// IT-facing password reset. People forget passwords and go to IT, so IT_Admin
// can send a reset email without being an app-wide Super_Admin.
export default async function ITPasswordsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: me } = await supabase
    .from("profiles")
    .select("role")
    .eq("user_id", user!.id)
    .single();
  const role = (me as { role?: string } | null)?.role;
  if (role !== "IT_Admin" && role !== "Super_Admin") redirect("/dashboard");

  // Only people with a login can have a password reset.
  const { data: people } = await supabase
    .from("profiles")
    .select("id, full_name, email, user_id")
    .not("user_id", "is", null)
    .is("archived_at", null)
    .order("full_name");

  return (
    <PasswordResetTool
      people={(people ?? []) as { id: string; full_name: string; email: string | null }[]}
    />
  );
}
