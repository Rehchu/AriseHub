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
      className="group flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-ink-200 transition hover:bg-ink-700 hover:text-onaccent"
    >
      <Icon name="wrench" />
      <span className="flex-1">IT Portal</span>
      <span className="text-[10px] text-ink-400">{busy ? "…" : "↗"}</span>
    </a>
  );
}
