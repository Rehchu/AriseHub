import { createClient } from "@/lib/supabase/server";
import {
  SermonArchive,
  type PlanOption,
  type SermonRow,
  type SeriesRow,
} from "@/components/sermons/SermonArchive";

export const metadata = { title: "Service archive" };

// The archive of services already preached, living under Services because that
// is where the plan it came from lives. RLS returns only published sermons to
// everyone except the services roles, so this page needs no gate of its own —
// staff simply see their unpublished drafts alongside the rest.
export default async function ServiceArchivePage() {
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
  const canManage = me?.role === "Super_Admin" || me?.role === "Staff";

  const [{ data: sermons }, { data: series }] = await Promise.all([
    supabase
      .from("sermons")
      .select(
        "id, plan_id, title, speaker_name, speaker_id, series_id, preached_on, scripture_refs, youtube_url, summary, published",
      )
      .order("preached_on", { ascending: false })
      .limit(200),
    supabase.from("sermon_series").select("id, name").order("name"),
  ]);

  const rows = (sermons ?? []) as SermonRow[];

  // Services that have happened but aren't archived yet. Archiving one carries
  // its title, date and campus across, so nobody retypes what the plan already
  // knows — the whole point of doing this from Services rather than a blank form.
  let plans: PlanOption[] = [];
  if (canManage) {
    const archived = new Set(rows.map((r) => r.plan_id).filter(Boolean) as string[]);
    const { data: planRows } = await supabase
      .from("service_plans")
      .select("id, title, service_date, campus_id")
      .lte("service_date", new Date().toISOString().slice(0, 10))
      .order("service_date", { ascending: false })
      .limit(30);
    plans = ((planRows ?? []) as PlanOption[]).filter((p) => !archived.has(p.id));
  }

  return (
    <SermonArchive
      rows={rows}
      series={(series ?? []) as SeriesRow[]}
      plans={plans}
      canManage={canManage}
    />
  );
}
