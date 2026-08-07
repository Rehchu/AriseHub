import { createClient } from "@/lib/supabase/server";
import { SongLibrary, type Song } from "@/components/services/SongLibrary";

export default async function SongsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: profile } = await supabase
    .from("profiles")
    .select("id, role")
    .eq("user_id", user!.id)
    .single();
  const role = (profile as { role?: string } | null)?.role;
  const canManage = role === "Super_Admin" || role === "Staff";

  const { data: songs } = await supabase
    .from("songs")
    .select("id, title, artist, ccli_number, default_key, bpm, themes, notes, chart_url, elvanto_id, archived")
    .eq("archived", false)
    .order("title");

  return (
    <SongLibrary
      initial={(songs ?? []) as Song[]}
      canManage={canManage}
      currentProfileId={(profile as { id: string }).id}
    />
  );
}
