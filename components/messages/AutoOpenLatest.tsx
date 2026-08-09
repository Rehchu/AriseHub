"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Desktop-only: /messages with nothing selected replaces itself with the most
 * recently active conversation, so the second pane never sits dead. On phones
 * (below lg) /messages IS the channel list — navigating away would hide it —
 * so the media query keeps the list-first behaviour there. The listener also
 * catches a window growing past lg while parked on /messages.
 */
export function AutoOpenLatest({ channelId }: { channelId: string | null }) {
  const router = useRouter();

  useEffect(() => {
    if (!channelId) return;
    // 64rem — Tailwind's lg breakpoint, the same one MessagesPanes splits on.
    const mq = window.matchMedia("(min-width: 1024px)");
    const go = () => {
      if (mq.matches) router.replace(`/messages/${channelId}`);
    };
    go();
    mq.addEventListener("change", go);
    return () => mq.removeEventListener("change", go);
  }, [channelId, router]);

  return null;
}
