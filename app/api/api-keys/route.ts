import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { refuseBearer, requireSuperAdmin } from "@/lib/api-key-guards";
import {
  DEFAULT_EXPIRY_DAYS,
  EXPIRY_DAYS,
  expiryFromDays,
  generateApiKey,
  hashApiKey,
  keyPrefix,
} from "@/lib/api-keys";

export const runtime = "nodejs";

// Columns a browser may see. key_hash is not among them, and migration 0081
// withholds the column grant as well.
const COLUMNS = "id, name, prefix, created_at, expires_at, last_used_at, last_used_ip, revoked_at";

/** Your keys, newest first. Never the key itself — that was shown once. */
export async function GET(req: NextRequest) {
  const refused = refuseBearer(req);
  if (refused) return refused;
  const ctx = await requireSuperAdmin();
  if ("error" in ctx) return ctx.error;

  const { data, error } = await ctx.supabase
    .from("api_keys")
    .select(COLUMNS)
    .eq("profile_id", ctx.profileId)
    .order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 502 });
  return NextResponse.json({ keys: data ?? [] }, { headers: { "Cache-Control": "no-store" } });
}

/** Create a key. The response is the only time its plaintext exists. */
export async function POST(req: NextRequest) {
  const refused = refuseBearer(req);
  if (refused) return refused;
  const ctx = await requireSuperAdmin();
  if ("error" in ctx) return ctx.error;

  const body = (await req.json().catch(() => ({}))) as { name?: string; expiresInDays?: number };
  const name = (body.name ?? "").trim();
  if (!name || name.length > 80) {
    return NextResponse.json({ error: "Give the key a name (up to 80 characters)." }, { status: 400 });
  }
  const days = body.expiresInDays ?? DEFAULT_EXPIRY_DAYS;
  if (!(EXPIRY_DAYS as readonly number[]).includes(days)) {
    return NextResponse.json({ error: `Expiry must be one of ${EXPIRY_DAYS.join(", ")} days.` }, { status: 400 });
  }

  const key = generateApiKey();
  const expiresAt = expiryFromDays(days);
  // Service role: there is deliberately no insert policy on api_keys (0081).
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("api_keys")
    .insert({
      profile_id: ctx.profileId,
      name,
      prefix: keyPrefix(key),
      key_hash: await hashApiKey(key),
      expires_at: expiresAt,
    })
    .select(COLUMNS)
    .single();
  if (error || !data) {
    return NextResponse.json({ error: error?.message ?? "Could not create the key" }, { status: 502 });
  }

  // A credential that can do everything its owner can is a change to who has
  // authority, which is exactly what chms_audit_log exists to record (0044).
  const { error: auditError } = await admin.from("chms_audit_log").insert({
    user_id: ctx.profileId,
    action: "api_key.created",
    entity_type: "api_key",
    entity_id: (data as { id: string }).id,
    details: { name, prefix: keyPrefix(key), expires_at: expiresAt },
    ip_address: req.headers.get("cf-connecting-ip"),
  });
  if (auditError) console.error("api-keys: audit write failed", auditError.message);

  return NextResponse.json(
    { key, record: data },
    { status: 201, headers: { "Cache-Control": "no-store" } },
  );
}
