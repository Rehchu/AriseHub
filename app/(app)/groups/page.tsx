import { createClient } from "@/lib/supabase/server";
import { GroupsList, type GroupRow } from "@/components/groups/GroupsList";

export default async function GroupsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: profile } = await supabase
    .from("profiles")
    .select("id")
    .eq("user_id", user!.id)
    .single();
  const profileId = (profile as { id: string } | null)?.id ?? "";

  const [{ data: groups }, { data: members }] = await Promise.all([
    supabase
      .from("groups")
      .select("id, name, description, group_type, meeting_schedule, is_open")
      .order("name"),
    supabase.from("group_members").select("group_id, profile_id, role"),
  ]);

  const counts: Record<string, number> = {};
  const mine = new Set<string>();
  for (const m of (members ?? []) as { group_id: string; profile_id: string }[]) {
    counts[m.group_id] = (counts[m.group_id] ?? 0) + 1;
    if (m.profile_id === profileId) mine.add(m.group_id);
  }

  const rows: GroupRow[] = ((groups ?? []) as Array<Omit<GroupRow, "memberCount" | "isMember">>).map(
    (g) => ({ ...g, memberCount: counts[g.id] ?? 0, isMember: mine.has(g.id) }),
  );

  return <GroupsList initial={rows} currentProfileId={profileId} />;
}
