"use client";

import { useState } from "react";
import { Icon } from "./Icon";
import { IT_PORTAL, openITPortal } from "@/components/it/portalHandoff";

/** Sidebar link that opens the IT portal already signed in. */
export function ITPortalLink({ onNavigate }: { onNavigate?: () => void }) {
  const [busy, setBusy] = useState(false);

  async function open(e: React.MouseEvent) {
    e.preventDefault();
    onNavigate?.();
    setBusy(true);
    await openITPortal();
  }

  return (
    <a
      href={IT_PORTAL}
      onClick={open}
      /* chrome-*, matching every other item in this nav. The sidebar never
         inverts, but ink-200 does — so in dark mode this sat at 1.61:1 on a
         surface that stayed near-black, i.e. the one link that disappeared
         while its neighbours stayed put. */
      className="group flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-chrome-200 transition hover:bg-chrome-700 hover:text-chrome-50"
    >
      <Icon name="wrench" />
      <span className="flex-1">IT Portal</span>
      <span className="text-[10px] text-chrome-300">{busy ? "…" : "↗"}</span>
    </a>
  );
}
