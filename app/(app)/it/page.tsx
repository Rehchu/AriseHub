import { createClient } from "@/lib/supabase/server";
import { ITPortal } from "@/components/it/ITPortal";

// The IT half of AriseHub. Its data lives in the existing Arise-IT Cloudflare
// Worker (Hono + D1) — a separate service, not Supabase — so this module links
// into it with the user's identity prefilled. Phase 2's auth bridge will make
// the AriseHub session valid against that Worker's API for inline data.
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

  // IT administration is unlocked by IT DEPARTMENT MEMBERSHIP — so adding
  // someone to the IT department in Admin → People gives them the IT tools,
  // no role change needed. Super_Admin always has it.
  let inItDept = false;
  if (p?.id) {
    const { data: itDept } = await supabase
      .from("departments")
      .select("id")
      .eq("slug", "it")
      .maybeSingle();
    if (itDept) {
      const { data: membership } = await supabase
        .from("department_members")
        .select("id")
        .eq("department_id", (itDept as { id: string }).id)
        .eq("profile_id", p.id)
        .maybeSingle();
      inItDept = !!membership;
    }
  }

  return (
    <ITPortal
      name={p?.full_name ?? ""}
      email={p?.email ?? user?.email ?? ""}
      isItAdmin={inItDept || p?.role === "Super_Admin"}
    />
  );
}
