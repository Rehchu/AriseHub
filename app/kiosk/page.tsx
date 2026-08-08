import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { CheckinStation, type CheckinRow, type RoomRow, type PersonRow } from "@/components/checkins/CheckinStation";
import { canRunCheckin } from "@/lib/roles";
import { Logo } from "@/components/Logo";

// KIOSK MODE — the check-in station view for tablets.
//
// Same check-in tool, but deliberately OUTSIDE the app shell: no sidebar, no
// module switcher, no way to browse into People / Care / Admin. A tablet left
// on a table in the lobby therefore exposes only check-in.
export default async function KioskPage() {
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
  // Matches public.is_checkin_role() — see lib/roles.ts.
  if (!p || !canRunCheckin(p.role)) redirect("/dashboard");

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  // Via checkin_people — date_of_birth and has_allergy are no longer granted
  // on profiles church-wide (0049).
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

  const childIds = [...new Set(((checkins ?? []) as { profile_id: string }[]).map((c) => c.profile_id))];
  const { data: kids } = childIds.length
    ? await supabase.from("checkin_people").select("id, full_name, has_allergy").in("id", childIds)
    : { data: [] };
  const kidById: Record<string, { full_name: string; has_allergy: boolean }> = {};
  for (const k of (kids ?? []) as { id: string; full_name: string; has_allergy: boolean }[]) {
    kidById[k.id] = { full_name: k.full_name, has_allergy: k.has_allergy };
  }

  // Siblings matter more here than at the staffed desk: this is the tablet a
  // parent uses themselves, with their own three children in tow.
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
    <div className="flex min-h-[100dvh] flex-col bg-ink-50">
      <header className="flex items-center gap-2 border-b border-ink-100 bg-white px-4 py-3 pt-safe safe-x">
        <Logo size={26} />
        <span className="font-display font-bold text-ink-900">
          Arise<span className="text-brand-500">Hub</span>
          <span className="ml-2 rounded bg-cyan-50 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-cyan-700">
            Check-in station
          </span>
        </span>
      </header>
      <main className="flex-1 pb-safe">
        <CheckinStation
          initial={rows}
          rooms={(rooms ?? []) as RoomRow[]}
          people={(people ?? []) as PersonRow[]}
          siblings={siblings}
          currentProfileId={p.id}
          campusId={p.campus_id}
          isCheckinLead={p.is_checkin_lead || p.role === "Super_Admin"}
        />
      </main>
      <footer className="px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] text-center text-xs text-ink-400">
        Kiosk mode · <a href="/dashboard" className="underline">exit to full AriseHub</a>
      </footer>
    </div>
  );
}
