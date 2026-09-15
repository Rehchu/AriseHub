import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { refuseBearer, requireSuperAdmin } from "@/lib/api-key-guards";

export const runtime = "nodejs";

/**
 * Revoke a key.
 *
 * Takes effect for NEW exchanges immediately. A session the key already
 * exchanged for stays valid until it expires — at most an hour — because a
 * Supabase access token is a signed JWT that nobody can recall. That ceiling is
 * why /api/agent/token hands out one-hour sessions and no refresh token.
 */
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const refused = refuseBearer(req);
  if (refused) return refused;
  const ctx = await requireSuperAdmin();
  if ("error" in ctx) return ctx.error;

  const { id } = await params;
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("api_keys")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", id)
    .is("revoked_at", null)
    .select("id, name, prefix, profile_id")
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 502 });
  if (!data) return NextResponse.json({ error: "No active key with that id." }, { status: 404 });

  const row = data as { id: string; name: string; prefix: string; profile_id: string };
  const { error: auditError } = await admin.from("chms_audit_log").insert({
    user_id: ctx.profileId,
    action: "api_key.revoked",
    entity_type: "api_key",
    entity_id: row.id,
    details: { name: row.name, prefix: row.prefix, owner_profile_id: row.profile_id },
    ip_address: req.headers.get("cf-connecting-ip"),
  });
  if (auditError) console.error("api-keys: audit write failed", auditError.message);

  return NextResponse.json({ revoked: row.id });
}
