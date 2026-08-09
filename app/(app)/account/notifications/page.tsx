import { createClient } from "@/lib/supabase/server";
import { NotificationSettings } from "@/components/pwa/NotificationSettings";

export default async function NotificationsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: profile } = await supabase
    .from("profiles")
    .select("id, full_name, role")
    .eq("user_id", user!.id)
    .single();

  const p = profile as { id: string; full_name: string; role: string } | null;

  // Sending a test push is a support tool, so keep it with IT rather than
  // giving every member a button that emits notifications.
  let isIT = p?.role === "IT_Admin" || p?.role === "Super_Admin";
  if (!isIT && p?.id) {
    const { data: m } = await supabase
      .from("department_members")
      .select("id, departments!inner(slug)")
      .eq("profile_id", p.id)
      .eq("departments.slug", "it")
      .maybeSingle();
    isIT = !!m;
  }

  // How many devices this person has registered — useful when someone says
  // "it works on my laptop but not my phone".
  const { data: subs } = await supabase
    .from("push_subscriptions")
    .select("id, user_agent, created_at, last_sent_at, last_status")
    .eq("profile_id", p?.id ?? "");

  return (
    <NotificationSettings
      profileId={p?.id ?? ""}
      devices={(subs ?? []) as { id: string; user_agent: string | null; created_at: string }[]}
      canTest={isIT}
    />
  );
}
