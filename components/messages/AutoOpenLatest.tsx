"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";

/**
 * Desktop-only: /messages with nothing selected replaces itself with the most
 * recently active conversation, so the second pane never sits dead. On phones
 * (below lg) /messages IS the channel list — navigating away would hide it —
 * so the media query keeps the list-first behaviour there. Checked once on
 * mount only: navigating on a later breakpoint change (e.g. tablet rotation)
 * would destroy the /messages history entry.
 */
export function AutoOpenLatest({ channelId }: { channelId: string | null }) {
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!channelId) return;
    const target = `/messages/${channelId}`;
    if (pathname === target) return;
    // 64rem — Tailwind's lg breakpoint, the same one MessagesPanes splits on.
    if (window.matchMedia("(min-width: 1024px)").matches) {
      router.replace(target);
    }
  }, [channelId, pathname, router]);

  return null;
}
