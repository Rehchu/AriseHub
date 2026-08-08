import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { TitlesAdmin, type MinistryTitle } from "@/components/admin/TitlesAdmin";

export default async function TitlesPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("user_id", user!.id)
    .single();
  // A title that grants Admin is a privilege decision, so this screen is
  // Super_Admin-only even though everyone can READ the titles.
  if ((profile as { role?: string } | null)?.role !== "Super_Admin") {
    redirect("/dashboard");
  }

  const { data: titles } = await supabase
    .from("ministry_titles")
    .select("id, name, role, sort_order")
    .order("sort_order");

  return <TitlesAdmin initial={(titles ?? []) as MinistryTitle[]} />;
}
