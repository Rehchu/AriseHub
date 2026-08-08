"use client";

import { useEffect, useState } from "react";
import { isKioskLocked, onKioskLockChange } from "@/lib/kiosk-lock";

/**
 * Mounted in the authenticated app shell. If this device is in tablet lockdown,
 * nothing but the check-in station is allowed to render — a bookmark, a
 * notification tap, or a reload that lands on /dashboard goes straight back.
 *
 * `location.replace` rather than the router: it leaves no history entry, so
 * back doesn't bounce between the two.
 */
export function KioskGuard() {
  const [blocked, setBlocked] = useState(false);

  useEffect(() => {
    const check = () => {
      if (!isKioskLocked()) {
        setBlocked(false);
        return;
      }
      setBlocked(true);
      if (window.location.pathname !== "/kiosk") window.location.replace("/kiosk");
    };
    check();
    return onKioskLockChange(check);
  }, []);

  if (!blocked) return null;

  // Cover the page for the moment between "locked" and the navigation landing,
  // so a glance at a lobby tablet never catches the directory mid-redirect.
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-ink-50 text-sm text-ink-500">
      Returning to the check-in station…
    </div>
  );
}
