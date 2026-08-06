import { createClient } from "@/lib/supabase/server";
import { ChannelList } from "@/components/messages/ChannelList";
import { MessagesPanes } from "@/components/messages/MessagesPanes";

export default async function MessagesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: profile } = await supabase
    .from("profiles")
    .select("id")
    .eq("user_id", user!.id)
    .single();

  const currentProfileId = profile?.id ?? "";

  // Mobile: show EITHER the channel list (at /messages) or the thread
  // (at /messages/[id]) — never both in a 320px-wide split. Desktop (lg+) shows
  // the classic two-pane layout. Handled with CSS in MessagesPanes so it works
  // without JS and survives client navigation.
  return (
    <MessagesPanes list={<ChannelList currentProfileId={currentProfileId} />}>
      {children}
    </MessagesPanes>
  );
}
