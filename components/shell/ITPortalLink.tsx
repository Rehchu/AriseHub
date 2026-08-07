"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Icon } from "./Icon";

const IT_PORTAL =
  process.env.NEXT_PUBLIC_IT_PORTAL_URL ?? "https://itportal.myfaithtech.com";

/**
 * Opens the IT portal already signed in.
 *
 * The portal's API accepts AriseHub tokens, but its frontend is a separate SPA
 * that needs the church_session cookie — so we exchange the AriseHub session
 * for a portal session first, then open it. Both hosts are subdomains of
 * myfaithtech.com, so the credentialed request can set the cookie.
 *
 * The token never goes in a URL.
 */
export function ITPortalLink({ onNavigate }: { onNavigate?: () => void }) {
  const supabase = createClient();
  const [busy, setBusy] = useState(false);

  async function open(e: React.MouseEvent) {
    e.preventDefault();
    onNavigate?.();
    setBusy(true);

    // Open the tab up-front: doing it after an await trips pop-up blockers.
    const tab = window.open("", "_blank");

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (session?.access_token) {
        await fetch(`${IT_PORTAL}/api/auth/sso`, {
          method: "POST",
          credentials: "include",
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
      }
    } catch {
      // Fall through — the portal will just ask for a login as before.
    } finally {
      setBusy(false);
      if (tab) tab.location.href = IT_PORTAL;
      else window.location.href = IT_PORTAL;
    }
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
