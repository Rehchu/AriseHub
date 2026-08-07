import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { RoomsAdmin, type RoomRow } from "@/components/admin/RoomsAdmin";
import type { Campus } from "@/lib/database.types";

export default async function RoomsAdminPage() {
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
  // Rooms are campus infrastructure — Super_Admin and Staff manage them.
  if (role !== "Super_Admin" && role !== "Staff") redirect("/dashboard");

  const [{ data: rooms }, { data: campuses }] = await Promise.all([
    supabase
      .from("rooms")
      .select("id, name, description, campus_id, capacity, min_age, max_age, active")
      .order("name"),
    supabase.from("campuses").select("id, name").order("name"),
  ]);

  return (
    <RoomsAdmin
      initial={(rooms ?? []) as RoomRow[]}
      campuses={(campuses ?? []) as Pick<Campus, "id" | "name">[]}
    />
  );
}
