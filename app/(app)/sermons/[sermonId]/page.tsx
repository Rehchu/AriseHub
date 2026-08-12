import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { SermonDetail, type Cue, type Sermon } from "@/components/sermons/SermonDetail";

// One archived message: the video, what it was about, and the transcript.
// RLS hides unpublished sermons from everyone but the services roles, so a
// missing row here is simply a 404 rather than a leak of its existence.
export default async function SermonPage({
  params,
}: {
  params: Promise<{ sermonId: string }>;
}) {
  const { sermonId } = await params;
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
  const canManage = role === "Super_Admin" || role === "Staff";

  const { data: sermon } = await supabase
    .from("sermons")
    .select(
      "id, title, speaker_name, series_id, preached_on, scripture_refs, youtube_url, summary, published",
    )
    .eq("id", sermonId)
    .maybeSingle();
  if (!sermon) notFound();

  const [{ data: cues }, { data: series }] = await Promise.all([
    supabase
      .from("sermon_transcript_cues")
      .select("idx, start_seconds, end_seconds, text")
      .eq("sermon_id", sermonId)
      .order("idx"),
    supabase.from("sermon_series").select("id, name"),
  ]);

  const seriesName =
    (series as { id: string; name: string }[] | null)?.find(
      (s) => s.id === (sermon as { series_id: string | null }).series_id,
    )?.name ?? null;

  return (
    <SermonDetail
      sermon={sermon as Sermon}
      cues={(cues ?? []) as Cue[]}
      seriesName={seriesName}
      canManage={canManage}
    />
  );
}
