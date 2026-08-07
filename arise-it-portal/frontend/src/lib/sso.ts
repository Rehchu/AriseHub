// Single sign-on handoff from AriseHub.
//
// AriseHub sends us here as  itportal.../#sso=<supabase access token>.
// The token rides in the URL FRAGMENT, which browsers never send to a server —
// so it stays out of request logs, proxies and Referer headers.
//
// We then POST it to /api/auth/sso on THIS origin. Doing the exchange
// same-origin matters: a cross-origin fetch can't reliably set a cookie any
// more, which is exactly why the earlier direct hand-off failed.

export interface SsoResult {
  attempted: boolean;
  ok: boolean;
  error?: string;
}

export async function consumeSsoToken(): Promise<SsoResult> {
  const hash = window.location.hash || "";
  const match = hash.match(/[#&]sso=([^&]+)/);
  if (!match) return { attempted: false, ok: false };

  const token = decodeURIComponent(match[1]);

  // Strip the token from the URL immediately so it never lands in history,
  // a bookmark, or a screen-share.
  const cleanHash = hash.replace(/[#&]sso=[^&]*/, "").replace(/^#$/, "");
  window.history.replaceState(
    null,
    "",
    window.location.pathname + window.location.search + (cleanHash || ""),
  );

  try {
    const res = await fetch("/api/auth/sso", {
      method: "POST",
      credentials: "include",
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) return { attempted: true, ok: true };
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    return { attempted: true, ok: false, error: body.error ?? `HTTP ${res.status}` };
  } catch (e) {
    return {
      attempted: true,
      ok: false,
      error: e instanceof Error ? e.message : "Could not reach the portal API",
    };
  }
}
