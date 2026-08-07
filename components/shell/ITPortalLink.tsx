"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Icon } from "./Icon";

const IT_PORTAL =
  process.env.NEXT_PUBLIC_IT_PORTAL_URL ?? "https://itportal.myfaithtech.com";

/**
 * Opens the IT portal already signed in.
 *
 * The portal's frontend is a separate SPA that needs its own church_session
 * cookie. Handing the session over by calling the portal's API directly from
 * here doesn't work — browsers no longer reliably honour Set-Cookie on a
 * cross-origin request.
 *
 * So we pass the AriseHub token in the URL FRAGMENT. Fragments are never sent
 * to a server (so it stays out of logs, proxies and Referer headers), and the
 * portal exchanges it SAME-ORIGIN for a cookie, then strips it from the URL
 * before anything renders.
 */
export function ITPortalLink({ onNavigate }: { onNavigate?: () => void }) {
  const supabase = createClient();
  const [busy, setBusy] = useState(false);

  async function open(e: React.MouseEvent) {
    e.preventDefault();
    onNavigate?.();
    setBusy(true);

    let url = IT_PORTAL;
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (session?.access_token) {
        url = `${IT_PORTAL}/#sso=${encodeURIComponent(session.access_token)}`;
      }
    } catch {
      // No token — the portal will just ask for a login, as before.
    }
    setBusy(false);
    window.location.href = url;
  }

  return (
    <a
      href={IT_PORTAL}
      onClick={open}
      className="group flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-ink-200 transition hover:bg-ink-700 hover:text-white"
    >
      <Icon name="wrench" />
      <span className="flex-1">IT Portal</span>
      <span className="text-[10px] text-ink-400">{busy ? "…" : "↗"}</span>
    </a>
  );
}
