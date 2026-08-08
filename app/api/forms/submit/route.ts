import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyTurnstile } from "@/lib/turnstile";

export const runtime = "nodejs";

/**
 * Public form (Connect Card) submissions.
 *
 * PublicForm rendered a Turnstile widget, stored the token in state, and then
 * inserted straight into `form_submissions` from the browser without ever
 * sending it. The bot protection was decorative — a script could POST the
 * PostgREST endpoint all day with the publishable key, which ships in the
 * client bundle.
 *
 * Submissions come through here now so the token is actually checked, and the
 * direct anon INSERT policy is dropped (0052) so this is the only way in. The
 * insert runs with the service role, which bypasses RLS — hence the explicit
 * is_active check below, which is what the old policy enforced.
 *
 * verifyTurnstile fails OPEN when Turnstile isn't configured. That is
 * deliberate and documented in lib/turnstile.ts: a Cloudflare outage shouldn't
 * stop someone filling in a connect card at a church service.
 */
export async function POST(req: NextRequest) {
  let body: {
    formId?: string;
    submitterName?: string | null;
    data?: Record<string, unknown>;
    turnstileToken?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Bad request." }, { status: 400 });
  }

  const { formId, submitterName, data, turnstileToken } = body;
  if (!formId || !data || typeof data !== "object") {
    return NextResponse.json({ error: "Missing details." }, { status: 400 });
  }

  const bot = await verifyTurnstile(turnstileToken, req.headers.get("cf-connecting-ip"));
  if (!bot.ok) {
    return NextResponse.json(
      { error: bot.error ?? "Verification failed — please try again." },
      { status: 400 },
    );
  }

  const admin = createAdminClient();

  // The service role bypasses RLS, so the check the anon policy used to do
  // (form_is_active) has to happen here instead.
  const { data: form } = await admin
    .from("forms")
    .select("id, is_active")
    .eq("id", formId)
    .maybeSingle();
  if (!form || !(form as { is_active: boolean }).is_active) {
    return NextResponse.json({ error: "This form is no longer accepting responses." }, { status: 403 });
  }

  // Cap the payload. This lands in a jsonb column from an unauthenticated
  // endpoint; without a bound, one request can write as much as it likes.
  const serialised = JSON.stringify(data);
  if (serialised.length > 20_000) {
    return NextResponse.json({ error: "That response is too long." }, { status: 400 });
  }

  const { error } = await admin.from("form_submissions").insert({
    form_id: formId,
    submitter_name: submitterName ? String(submitterName).slice(0, 200) : null,
    data,
  });
  if (error) {
    return NextResponse.json({ error: "Could not save your response." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
