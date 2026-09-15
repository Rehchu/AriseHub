import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ApiKeysAdmin } from "@/components/admin/ApiKeysAdmin";

export const metadata = { title: "API keys" };

// Super_Admin only, matching the routes behind it. A key acts with its owner's
// full permissions, so the people who may create one are the people for whom
// "everything I can do" is already everything.
export default async function ApiKeysPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: me } = await supabase
    .from("profiles")
    .select("role")
    .eq("user_id", user!.id)
    .single();
  if ((me as { role?: string } | null)?.role !== "Super_Admin") redirect("/dashboard");

  return <ApiKeysAdmin />;
}
