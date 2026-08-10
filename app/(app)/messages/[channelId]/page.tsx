import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Thread } from "@/components/messages/Thread";

export default async function ChannelPage({
  params,
}: {
  params: Promise<{ channelId: string }>;
}) {
  const { channelId } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // NOT email: 0049 revoked SELECT on profiles.email for authenticated, so
  // asking for it here made the WHOLE row come back null — which turned
  // currentProfileId into "" and every message send (DM and department alike)
  // failed with `invalid input syntax for type uuid: ""`. The requester email
  // lives on the auth user anyway (below).
  const { data: profile } = await supabase
    .from("profiles")
    .select("id, full_name")
    .eq("user_id", user!.id)
    .single();

  // RLS: this returns a row only if the caller belongs to the channel.
  const { data: channel } = await supabase
    .from("channels")
    .select("id, type, title, department_id")
    .eq("id", channelId)
    .maybeSingle();

  if (!channel) notFound();

  // Resolve a display title (department title, or the other DM participant).
  let title = channel.title ?? "Direct message";
  if (channel.type === "direct") {
    const { data: members } = await supabase
      .from("channel_members")
      .select("profile_id, profiles(full_name)")
      .eq("channel_id", channelId);
    const other = (members ?? []).find(
      (m: { profile_id: string }) => m.profile_id !== profile?.id,
    ) as { profiles: { full_name: string } | null } | undefined;
    title = other?.profiles?.full_name ?? title;
  }

  return (
    <Thread
      channelId={channelId}
      currentProfileId={profile?.id ?? ""}
      title={title}
      kind={channel.type}
      requesterName={(profile as { full_name?: string } | null)?.full_name ?? ""}
      requesterEmail={user!.email ?? ""}
    />
  );
}
