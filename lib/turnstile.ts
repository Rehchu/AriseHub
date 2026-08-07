// Cloudflare Turnstile — bot protection on the pages anyone can reach.
//
// The join link and Connect Cards are public URLs. A honeypot and rate limit
// stop casual noise, but not a determined script creating accounts or flooding
// form submissions.
//
// Both halves fail OPEN when unconfigured: if the keys aren't set, the widget
// doesn't render and verification passes. That keeps the app working while the
// keys are being created, rather than locking everyone out of registration.

export const TURNSTILE_SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;

export interface TurnstileResult {
  ok: boolean;
  /** True when Turnstile isn't configured, so the caller can log/decide. */
  skipped?: boolean;
  error?: string;
}

/** Verify a Turnstile token server-side. Never throws. */
export async function verifyTurnstile(
  token: string | undefined | null,
  remoteIp?: string | null,
): Promise<TurnstileResult> {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) return { ok: true, skipped: true };

  if (!token) return { ok: false, error: "Please complete the verification." };

  try {
    const body = new URLSearchParams();
    body.set("secret", secret);
    body.set("response", token);
    if (remoteIp) body.set("remoteip", remoteIp);

    const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
    const data = (await res.json()) as { success?: boolean; "error-codes"?: string[] };
    if (data.success) return { ok: true };
    return {
      ok: false,
      error: "Verification failed. Please try again.",
    };
  } catch {
    // A Turnstile outage shouldn't stop someone joining the church app.
    return { ok: true, skipped: true };
  }
}
