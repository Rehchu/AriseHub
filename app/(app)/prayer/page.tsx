import { createClient } from "@/lib/supabase/server";
import { PrayerWall, type PrayerRequest } from "@/components/prayer/PrayerWall";

export const metadata = { title: "Prayer" };

// What comes back is decided by RLS: the prayer team sees everything, everyone
// else sees only what was shared publicly plus their own requests.
export default async function PrayerPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, role")
    .eq("user_id", user!.id)
    .single();
  const me = profile as { id: string; role: string } | null;

  const { data: member } = await supabase
    .from("department_members")
    .select("id, departments!inner(slug)")
    .eq("profile_id", me?.id ?? "")
    .in("departments.slug", ["prayer", "prayer-team"])
    .maybeSingle();
  const isPrayerTeam = !!member || me?.role === "Super_Admin";

  const { data: rows } = await supabase
    .from("prayer_requests")
    .select(
      "id, person_id, submitted_name, contact, body, visibility, status, created_at, person:profiles!prayer_requests_person_id_fkey(full_name)",
    )
    .order("created_at", { ascending: false })
    .limit(200);

  return (
    <PrayerWall
      rows={(rows ?? []) as unknown as PrayerRequest[]}
      isPrayerTeam={isPrayerTeam}
      currentProfileId={me?.id ?? ""}
    />
  );
}
