import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { GroupDetail, type Member, type Meeting } from "@/components/groups/GroupDetail";

export default async function GroupPage({
  params,
}: {
  params: Promise<{ groupId: string }>;
}) {
  const { groupId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: profile } = await supabase
    .from("profiles")
    .select("id, role")
    .eq("user_id", user!.id)
    .single();
  const profileId = (profile as { id: string } | null)?.id ?? "";
  const isSuperAdmin = (profile as { role?: string } | null)?.role === "Super_Admin";

  const { data: group } = await supabase
    .from("groups")
    .select("id, name, description, group_type, meeting_schedule, is_open")
    .eq("id", groupId)
    .maybeSingle();
  if (!group) notFound();

  const [{ data: members }, { data: meetings }] = await Promise.all([
    supabase
      .from("group_members")
      .select("id, profile_id, role, profiles(full_name)")
      .eq("group_id", groupId),
    supabase
      .from("group_meetings")
      .select("id, title, meets_at, notes")
      .eq("group_id", groupId)
      .order("meets_at", { ascending: false }),
  ]);

  const roster: Member[] = ((members ?? []) as unknown as Array<{
    id: string;
    profile_id: string;
    role: string;
    profiles: { full_name: string } | null;
  }>).map((m) => ({
    id: m.id,
    profile_id: m.profile_id,
    role: m.role as Member["role"],
    full_name: m.profiles?.full_name ?? "Someone",
  }));

  const iAmLeader =
    isSuperAdmin ||
    roster.some((m) => m.profile_id === profileId && (m.role === "leader" || m.role === "assistant"));

  return (
    <GroupDetail
      group={
        group as {
          id: string;
          name: string;
          description: string | null;
          group_type: string;
          meeting_schedule: string | null;
          is_open: boolean;
        }
      }
      roster={roster}
      meetings={(meetings ?? []) as Meeting[]}
      currentProfileId={profileId}
      canManage={iAmLeader}
    />
  );
}
