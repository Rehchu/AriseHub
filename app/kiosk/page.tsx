import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { CheckinStation, type CheckinRow, type RoomRow, type PersonRow } from "@/components/checkins/CheckinStation";
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
    Omit<CheckinRow, "child"> & {
      child: { full_name: string; has_allergy: boolean }[] | { full_name: string; has_allergy: boolean } | null;
    }
  >).map((c) => ({ ...c, child: one(c.child) }));

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
