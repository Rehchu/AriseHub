"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Logo } from "@/components/Logo";

const IT_PORTAL =
  process.env.NEXT_PUBLIC_IT_PORTAL_URL ?? "https://itportal.myfaithtech.com";

/**
 * Sends IT staff straight into the portal, signed in.
 *
 * A server-side redirect can't do this — it would arrive with no portal session
 * and bounce to /login. We need the browser to carry the AriseHub token in the
 * URL fragment so the portal can exchange it same-origin.
 */
export function PortalLauncher() {
  const supabase = createClient();
  const [stalled, setStalled] = useState(false);

  useEffect(() => {
    let done = false;
    const slow = setTimeout(() => !done && setStalled(true), 4000);

    (async () => {
      let url = IT_PORTAL;
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();
        if (session?.access_token) {
          url = `${IT_PORTAL}/#sso=${encodeURIComponent(session.access_token)}`;
        }
      } catch {
        // fall through to a plain open
      }
      done = true;
      clearTimeout(slow);
      window.location.replace(url);
    })();

    return () => clearTimeout(slow);
  }, [supabase]);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 px-4 text-center">
      <Logo size={40} />
      <p className="font-medium text-ink-800">Opening the IT Portal…</p>
      <p className="text-sm text-ink-500">Signing you in with your AriseHub account.</p>
      {stalled && (
        <a href={IT_PORTAL} className="mt-2 text-sm font-medium text-brand-600 underline">
          Taking a while — open the portal directly
        </a>
      )}
    </div>
  );
}
