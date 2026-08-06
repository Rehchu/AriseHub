import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { CheckinStation, type CheckinRow, type RoomRow, type PersonRow } from "@/components/checkins/CheckinStation";

export default async function CheckinsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: profile } = await supabase
    .from("profiles")
    .select("id, role, campus_id, is_checkin_lead")
    .eq("user_id", user!.id)
    .single();

  const p = profile as {
    id: string;
    role: string;
    campus_id: string | null;
    is_checkin_lead: boolean;
  } | null;
  if (!p || !["Super_Admin", "IT_Admin", "Staff"].includes(p.role)) redirect("/dashboard");

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const [{ data: rooms }, { data: checkins }, { data: people }] = await Promise.all([
    supabase.from("rooms").select("id, name, capacity, min_age, max_age, active").order("name"),
    supabase
      .from("checkins")
      .select(
        "id, profile_id, room_id, status, security_code, checked_in_at, checked_out_at, notes, child:profiles!checkins_profile_id_fkey(full_name, has_allergy)",
      )
      .gte("checked_in_at", todayStart.toISOString())
      .order("checked_in_at", { ascending: false }),
    supabase
      .from("profiles")
      .select("id, full_name, has_allergy, date_of_birth")
      .is("archived_at", null)
      .order("full_name")
      .limit(500),
  ]);

  const one = <T,>(v: T[] | T | null): T | null => (Array.isArray(v) ? (v[0] ?? null) : v);
  const rows: CheckinRow[] = ((checkins ?? []) as unknown as Array<
    Omit<CheckinRow, "child"> & { child: { full_name: string; has_allergy: boolean }[] | { full_name: string; has_allergy: boolean } | null }
  >).map((c) => ({ ...c, child: one(c.child) }));

  return (
    <CheckinStation
      initial={rows}
      rooms={(rooms ?? []) as RoomRow[]}
      people={(people ?? []) as PersonRow[]}
      currentProfileId={p.id}
      campusId={p.campus_id}
      isCheckinLead={p.is_checkin_lead || p.role === "Super_Admin"}
    />
  );
}
