import { createClient } from "@/lib/supabase/client";

export const IT_PORTAL =
  process.env.NEXT_PUBLIC_IT_PORTAL_URL ?? "https://itportal.myfaithtech.com";

/**
 * Hand the AriseHub session to the IT portal and open it signed in.
 *
 * Uses a top-level form POST (the "POST binding" pattern). This is the only
 * approach that reliably works here:
 *
 *   - a cross-origin fetch can't set the portal's cookie (browsers block it);
 *   - a URL fragment relies on the SPA's JS, which the portal's service worker
 *     may serve from cache;
 *   - a query string would leak the token into access logs.
 *
 * A top-level POST is a first-party navigation, so Set-Cookie is honoured, the
 * token stays in the request body, and the Worker redirects before any cached
 * SPA code runs.
 */
export async function openITPortal(): Promise<void> {
  const supabase = createClient();
  let token: string | null = null;
  try {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    token = session?.access_token ?? null;
  } catch {
    token = null;
  }

  // No session to hand over — just open the portal normally.
  if (!token) {
    window.location.href = IT_PORTAL;
    return;
  }

  const form = document.createElement("form");
  form.method = "POST";
  form.action = `${IT_PORTAL}/api/auth/sso-redirect`;
  form.style.display = "none";

  const field = document.createElement("input");
  field.type = "hidden";
  field.name = "token";
  field.value = token;
  form.appendChild(field);

  document.body.appendChild(form);
  form.submit();
}
