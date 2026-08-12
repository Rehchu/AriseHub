import { createClient } from "@/lib/supabase/server";
import { SermonArchive, type SermonRow, type SeriesRow } from "@/components/sermons/SermonArchive";

export const metadata = { title: "Sermons" };

// The archive of messages already preached. RLS returns only published sermons
// to everyone except the services roles, so this page needs no gate of its own —
// staff simply see their unpublished drafts alongside the rest.
export default async function SermonsPage() {
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
        "id, title, speaker_name, speaker_id, series_id, preached_on, scripture_refs, youtube_url, summary, published",
      )
      .order("preached_on", { ascending: false })
      .limit(200),
    supabase.from("sermon_series").select("id, name").order("name"),
  ]);

  return (
    <SermonArchive
      rows={(sermons ?? []) as SermonRow[]}
      series={(series ?? []) as SeriesRow[]}
      canManage={canManage}
    />
  );
}
