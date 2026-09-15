import { NextResponse, type NextRequest } from "next/server";
import { createClient as createSbClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { bearerToken, hashApiKey, isApiKey, keyIsLive } from "@/lib/api-keys";
import {
  supabasePublishableKey as sbPublishableKey,
  supabaseUrl as sbUrl,
} from "@/lib/supabase/env";

export const runtime = "nodejs";

const IT_PORTAL =
  process.env.NEXT_PUBLIC_IT_PORTAL_URL ?? "https://itportal.myfaithtech.com";

/** One answer for every bad key, so a caller learns nothing about why. */
function unauthorized() {
  return NextResponse.json({ error: "invalid_api_key" }, { status: 401 });
}

/**
 * POST /api/agent/token — trade an API key for a one-hour session.
 *
 *   Authorization: Bearer ahk_…
 *
 * The session is a real Supabase sign-in for the key's owner, made without a
 * password or an email: the server generates a magic-link token and redeems it
 * on the spot. So the agent is not a privileged back door — every request it
 * makes is checked by the same RLS policies as the owner in a browser, and the
 * IT portal accepts the same token and applies its own roles.
 *
 * No refresh token is returned. The agent comes back here with the key when the
 * hour is up, which is what makes revoking the key actually stop it.
 *
 * Public in the middleware: the key IS the authentication.
 */
export async function POST(req: NextRequest) {
  const key = bearerToken(req.headers.get("authorization"));
  if (!key || !isApiKey(key)) return unauthorized();

  const admin = createAdminClient();
  const { data: keyRow } = await admin
    .from("api_keys")
    .select("id, profile_id, revoked_at, expires_at")
    .eq("key_hash", await hashApiKey(key))
    .maybeSingle();
  const row = keyRow as
    | { id: string; profile_id: string; revoked_at: string | null; expires_at: string | null }
    | null;
  if (!row || !keyIsLive(row)) return unauthorized();

  // The owner must still be someone who could sign in themselves.
  const { data: profileRow } = await admin
    .from("profiles")
    .select("id, user_id, full_name, role, archived_at")
    .eq("id", row.profile_id)
    .maybeSingle();
  const profile = profileRow as
    | { id: string; user_id: string | null; full_name: string; role: string; archived_at: string | null }
    | null;
  if (!profile?.user_id || profile.archived_at) return unauthorized();

  const { data: authData } = await admin.auth.admin.getUserById(profile.user_id);
  const authUser = authData?.user;
  const email = authUser?.email;
  const banned = authUser?.banned_until && new Date(authUser.banned_until).getTime() > Date.now();
  if (!email || banned) return unauthorized();

  const { data: link, error: linkError } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email,
  });
  const tokenHash = link?.properties?.hashed_token;
  if (linkError || !tokenHash) {
    console.error("agent/token: generateLink failed", linkError?.message);
    return NextResponse.json({ error: "could_not_start_session" }, { status: 502 });
  }

  // A throwaway client: nothing persisted, nothing refreshed, no cookies.
  const supabaseUrl = sbUrl();
  const publishableKey = sbPublishableKey();
  const anon = createSbClient(supabaseUrl, publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const { data: verified, error: verifyError } = await anon.auth.verifyOtp({
    token_hash: tokenHash,
    type: "magiclink",
  });
  const session = verified?.session;
  if (verifyError || !session) {
    console.error("agent/token: verifyOtp failed", verifyError?.message);
    return NextResponse.json({ error: "could_not_start_session" }, { status: 502 });
  }

  await admin
    .from("api_keys")
    .update({
      last_used_at: new Date().toISOString(),
      last_used_ip: req.headers.get("cf-connecting-ip"),
    })
    .eq("id", row.id);

  return NextResponse.json(
    {
      access_token: session.access_token,
      token_type: "bearer",
      expires_in: session.expires_in,
      expires_at: session.expires_at,
      user: { profile_id: profile.id, name: profile.full_name, role: profile.role, email },
      endpoints: {
        arisehub: new URL(req.url).origin,
        supabase_url: supabaseUrl,
        // Public by design — it identifies the project; the access token is
        // what authorises.
        supabase_publishable_key: publishableKey,
        it_portal: IT_PORTAL,
      },
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
