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

  const p = profile as { full_name: string; email: string | null; role: string } | null;

  return (
    <ITPortal
      name={p?.full_name ?? ""}
      email={p?.email ?? user?.email ?? ""}
      isItAdmin={p?.role === "IT_Admin" || p?.role === "Super_Admin"}
    />
  );
}
