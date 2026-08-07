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
    .select(
      "id, user_id, full_name, photo_url, role, title, campus_id, is_checkin_lead, archived_at, created_at, updated_at",
    )
    .eq("user_id", user.id)
    .single();

  // IT staff get the portal directly and don't see the "Get IT Help" button —
  // they raise tickets in the portal itself. Everyone else gets self-service.
  const p = profile as Profile | null;
  let isIT = p?.role === "IT_Admin";
  if (!isIT && p?.id) {
    const { data: itMember } = await supabase
      .from("department_members")
      .select("id, departments!inner(slug)")
      .eq("profile_id", p.id)
      .eq("departments.slug", "it")
      .maybeSingle();
    isIT = !!itMember;
  }

  // Pastoral care is Super_Admin + explicit grants; hide the nav item
  // for everyone else rather than letting them hit a redirect.
  const { data: canCare } = await supabase.rpc("is_pastoral");

  // Department heads issue their own invite links (0018), so they need the
  // nav entry even though /admin stays Super_Admin-only.
  const { data: leadsSomething } = await supabase.rpc("is_any_department_lead");
  const canInvite = p?.role === "Super_Admin" || !!leadsSomething;

  return (
    <Shell profile={p ?? null} email={user.email ?? ""} isIT={isIT} canCare={!!canCare} canInvite={canInvite}>
      {children}
    </Shell>
  );
}
