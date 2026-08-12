import { createClient } from "@/lib/supabase/server";
import {
  AnnouncementsBoard,
  type Announcement,
} from "@/components/announcements/AnnouncementsBoard";

export const metadata = { title: "Announcements" };

// RLS decides what comes back: submitters see their own at any status, everyone
// else only sees what was approved for the app. So this page needs no gate.
export default async function AnnouncementsPage() {
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
  const canApprove = me?.role === "Super_Admin" || me?.role === "Staff";

  const { data: rows } = await supabase
    .from("announcements")
    .select(
      "id, title, body, starts_on, ends_on, status, review_note, show_in_app, submitted_by, created_at, submitter:profiles!announcements_submitted_by_fkey(full_name)",
    )
    .order("created_at", { ascending: false })
    .limit(200);

  return (
    <AnnouncementsBoard
      rows={(rows ?? []) as unknown as Announcement[]}
      canApprove={canApprove}
      currentProfileId={me?.id ?? ""}
    />
  );
}
