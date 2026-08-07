import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

// The Admin section has different entry points per role — Staff only get Rooms,
// so sending everyone to Departments bounced them straight back to /dashboard.
export default async function AdminIndex() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("user_id", user!.id)
    .single();

  const role = (profile as { role?: string } | null)?.role;
  if (role === "Super_Admin") redirect("/admin/departments");
  if (role === "IT_Admin") redirect("/admin/elvanto");
  if (role === "Staff") redirect("/admin/rooms");
  redirect("/dashboard");
}
