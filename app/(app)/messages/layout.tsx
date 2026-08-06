import { createClient } from "@/lib/supabase/server";
import { ChannelList } from "@/components/messages/ChannelList";

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

  return (
    <div className="flex h-full">
      <ChannelList currentProfileId={currentProfileId} />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
