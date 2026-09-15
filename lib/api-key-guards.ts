import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Guards for the key-management routes (app/api/api-keys). Kept out of the
// route files because Next only allows a route module to export its handlers
// and segment config — a helper exported from route.ts fails the build.

/**
 * Key management needs a person at the keyboard.
 *
 * Any Authorization header is refused — a raw key, or the session a key
 * exchanges for. Otherwise a leaked key could mint itself a replacement before
 * it is revoked, which would make revocation meaningless.
 */
export function refuseBearer(req: NextRequest) {
  if (req.headers.get("authorization")) {
    return NextResponse.json(
      { error: "API keys can only be managed from a signed-in browser, not with a key or an agent session." },
      { status: 403 },
    );
  }
  return null;
}

/** The signed-in Super_Admin, or the response to send instead. */
export async function requireSuperAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: NextResponse.json({ error: "unauthorized" }, { status: 401 }) };

  const { data: me } = await supabase
    .from("profiles")
    .select("id, role")
    .eq("user_id", user.id)
    .single();
  const row = me as { id: string; role: string } | null;
  if (!row) return { error: NextResponse.json({ error: "no profile" }, { status: 403 }) };
  if (row.role !== "Super_Admin") {
    return { error: NextResponse.json({ error: "Super_Admin only" }, { status: 403 }) };
  }
  return { supabase, profileId: row.id };
}
