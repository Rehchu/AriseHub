import { createClient } from "@/lib/supabase/server";
import { Icon } from "@/components/shell/Icon";
import { AutoOpenLatest } from "@/components/messages/AutoOpenLatest";

// /messages with nothing selected. Desktop auto-opens the most recently active
// conversation (AutoOpenLatest) instead of showing a dead pane; on phones this
// pane is hidden behind the channel list (MessagesPanes) and nothing navigates.
export default async function MessagesIndex() {
  const supabase = await createClient();

  // RLS scopes `messages` to channels the caller belongs to, so the newest
  // visible message identifies their most recently active conversation.
  const { data: latest } = await supabase
    .from("messages")
    .select("channel_id")
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  let target = (latest as { channel_id: string } | null)?.channel_id ?? null;

  if (!target) {
    // No messages anywhere yet — fall back to the earliest channel membership,
    // scoped to the caller's own rows so an admin isn't dropped into a channel
    // whose messages they cannot read.
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const { data: profile } = await supabase
      .from("profiles")
      .select("id")
      .eq("user_id", user?.id ?? "")
      .maybeSingle();
    if (profile?.id) {
      const { data: membership } = await supabase
        .from("channel_members")
        .select("channel_id")
        .eq("profile_id", profile.id)
        .order("created_at")
        .limit(1)
        .maybeSingle();
      target = (membership as { channel_id: string } | null)?.channel_id ?? null;
    }
  }

  return (
    <div className="flex h-full w-full flex-col items-center justify-center px-6 text-center">
      <AutoOpenLatest channelId={target} />
      {target ? (
        // Visible for a moment on desktop while the redirect lands.
        <p className="text-sm text-ink-400">Opening your latest conversation…</p>
      ) : (
        <>
          <span className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-ink-100 text-ink-400">
            <Icon name="chat" size={28} />
          </span>
          <h2 className="font-display text-lg font-semibold text-ink-900">
            No conversations yet
          </h2>
          <p className="mt-1 max-w-xs text-sm text-ink-500">
            Start a direct message from the rail, or message IT under Support.
          </p>
        </>
      )}
    </div>
  );
}
