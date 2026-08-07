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
  // Department leads maintain the library too — the Praise Team leader is the
  // person who actually builds the song list, and they are rarely Staff.
  const { data: isLead } = await supabase.rpc("is_any_department_lead");
  const canManage = role === "Super_Admin" || role === "Staff" || !!isLead;

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
