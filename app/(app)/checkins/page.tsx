import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { CheckinStation, type CheckinRow, type RoomRow, type PersonRow } from "@/components/checkins/CheckinStation";
import { canRunCheckin } from "@/lib/roles";

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
  // Matches public.is_checkin_role() — see lib/roles.ts. This used to admit
  // IT_Admin (whose every insert RLS then refused) and redirect Volunteers away
  // from the desk they are meant to be working.
  if (!p || !canRunCheckin(p.role)) redirect("/dashboard");

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  // Reads go through `checkin_people`, not `profiles`. date_of_birth and
  // has_allergy are no longer granted church-wide (0049) — the view gates them
  // on is_checkin_role(), which is exactly who is standing here.
  const [{ data: rooms }, { data: checkins }, { data: people }] = await Promise.all([
    supabase.from("rooms").select("id, name, capacity, min_age, max_age, active, max_children_per_adult").order("name"),
    supabase
      .from("checkins")
      .select("id, profile_id, room_id, status, security_code, checked_in_at, checked_out_at, notes")
      .gte("checked_in_at", todayStart.toISOString())
      .order("checked_in_at", { ascending: false }),
    supabase
      .from("checkin_people")
      .select("id, full_name, has_allergy, date_of_birth")
      .is("archived_at", null)
      .order("full_name")
      .limit(500),
  ]);

  // Names for today's roster, resolved separately rather than embedded — an
  // embed would read those columns off `profiles` as the caller and no longer
  // resolves. Includes archived children, who the search list excludes.
  const childIds = [...new Set(((checkins ?? []) as { profile_id: string }[]).map((c) => c.profile_id))];
  const { data: kids } = childIds.length
    ? await supabase.from("checkin_people").select("id, full_name, has_allergy").in("id", childIds)
    : { data: [] };
  const kidById: Record<string, { full_name: string; has_allergy: boolean }> = {};
  for (const k of (kids ?? []) as { id: string; full_name: string; has_allergy: boolean }[]) {
    kidById[k.id] = { full_name: k.full_name, has_allergy: k.has_allergy };
  }

  // Sibling map, so three children from one family are one action rather than
  // three. Sunday morning with a queue behind you is where a check-in system
  // gets abandoned.
  const { data: memberships } = await supabase
    .from("family_members")
    .select("family_id, profile_id");
  const byFamily: Record<string, string[]> = {};
  for (const m of (memberships ?? []) as { family_id: string; profile_id: string }[]) {
    (byFamily[m.family_id] ??= []).push(m.profile_id);
  }
  const siblings: Record<string, string[]> = {};
  for (const ids of Object.values(byFamily)) {
    for (const id of ids) {
      siblings[id] = [...(siblings[id] ?? []), ...ids.filter((x) => x !== id)];
    }
  }

  const rows: CheckinRow[] = ((checkins ?? []) as Omit<CheckinRow, "child">[]).map((c) => ({
    ...c,
    child: kidById[c.profile_id] ?? null,
  }));

  return (
    <CheckinStation
      initial={rows}
      rooms={(rooms ?? []) as RoomRow[]}
      people={(people ?? []) as PersonRow[]}
      siblings={siblings}
      currentProfileId={p.id}
      campusId={p.campus_id}
      isCheckinLead={p.is_checkin_lead || p.role === "Super_Admin"}
    />
  );
}
