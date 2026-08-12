import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

/**
 * Flag people who attended regularly and have stopped (F11).
 *
 * Runs weekly from worker-entry's single cron tick. The work itself is one
 * Postgres function — see 0077 — because it is a single pass over attendance
 * history, and dragging that across the wire to count it here would be slower
 * and no clearer.
 *
 * Uses the admin client deliberately: there is no session on a cron run, and
 * the scan has to see everyone's attendance rather than one person's.
 *
 * Safe to run twice. The function refuses to raise a second alert for anybody
 * who already has one open, so a retry or an overlapping manual "Check now"
 * cannot pile up duplicates.
 */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  // Header only — a secret in a query string ends up in access logs.
  const provided = req.headers.get("x-cron-secret") ?? "";
  if (!secret || !timingSafeEqual(provided, secret)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const admin = createAdminClient();
  const { data, error } = await admin.rpc("scan_attendance_drop_offs");
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, flagged: data ?? 0 });
}
