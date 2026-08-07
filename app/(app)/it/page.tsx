import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { SelfHelp } from "@/components/it/SelfHelp";
import { PortalLauncher } from "@/components/it/PortalLauncher";

const IT_PORTAL =
  process.env.NEXT_PUBLIC_IT_PORTAL_URL ?? "https://itportal.myfaithtech.com";

export default async function ITPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: profile } = await supabase
    .from("profiles")
    .select("id, full_name, email, role")
    .eq("user_id", user!.id)
    .single();

  const p = profile as { id: string; full_name: string; email: string | null; role: string } | null;

  // IT staff belong in the portal itself, not the self-help page.
  let isIT = p?.role === "IT_Admin";
  if (!isIT && p?.id) {
    const { data: m } = await supabase
      .from("department_members")
      .select("id, departments!inner(slug)")
      .eq("profile_id", p.id)
      .eq("departments.slug", "it")
      .maybeSingle();
    isIT = !!m;
  }
  // A server redirect would land with no portal session and bounce to /login —
  // the browser has to carry the token, so hand off client-side.
  if (isIT) return <PortalLauncher />;

  return (
    <SelfHelp
      name={p?.full_name ?? ""}
      email={p?.email ?? user?.email ?? ""}
      portalUrl={IT_PORTAL}
    />
  );
}
