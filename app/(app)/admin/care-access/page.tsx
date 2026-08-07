import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { CareAccessAdmin, type Grant } from "@/components/admin/CareAccessAdmin";

// Who may see Pastoral Care. Super_Admin (Apostle & Pastor) only — they alone
// grant and revoke access.
export default async function CareAccessPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: me } = await supabase
    .from("profiles")
    .select("role")
    .eq("user_id", user!.id)
    .single();
  if ((me as { role?: string } | null)?.role !== "Super_Admin") redirect("/dashboard");

  const [{ data: grants }, { data: people }, { data: supers }] = await Promise.all([
    supabase
      .from("care_access")
      .select("profile_id, granted_at, note"),
    supabase
      .from("people_directory")
      .select("id, full_name, email, role")
      .is("archived_at", null)
      .not("user_id", "is", null)
      .order("full_name"),
    supabase.from("people_directory").select("id, full_name").eq("role", "Super_Admin"),
  ]);

  // Names come from the same directory list rather than an embedded join —
  // contact columns are only reachable through people_directory now (0029).
  const byId = new Map(
    ((people ?? []) as { id: string; full_name: string; email: string | null }[]).map((p) => [
      p.id,
      p,
    ]),
  );

  const normalized: Grant[] = ((grants ?? []) as Array<{
    profile_id: string;
    granted_at: string;
    note: string | null;
  }>).map((g) => {
    const p = byId.get(g.profile_id);
    return {
      profile_id: g.profile_id,
      granted_at: g.granted_at,
      note: g.note,
      full_name: p?.full_name ?? "Someone",
      email: p?.email ?? null,
    };
  });

  return (
    <CareAccessAdmin
      grants={normalized}
      people={(people ?? []) as { id: string; full_name: string; email: string | null; role: string }[]}
      alwaysAllowed={(supers ?? []) as { id: string; full_name: string }[]}
    />
  );
}
