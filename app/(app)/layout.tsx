import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Shell } from "@/components/shell/Shell";
import type { Profile } from "@/lib/database.types";

// Server layout for the authenticated app: resolves the signed-in user's
// profile (created automatically by the signup trigger) and hands it to the
// client shell for role-gated navigation.
export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("user_id", user.id)
    .single();

  return (
    <Shell profile={(profile as Profile) ?? null} email={user.email ?? ""}>
      {children}
    </Shell>
  );
}
