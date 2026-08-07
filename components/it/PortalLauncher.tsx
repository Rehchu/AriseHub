"use client";

import { useEffect, useState } from "react";
import { Logo } from "@/components/Logo";
import { IT_PORTAL, openITPortal } from "./portalHandoff";

/** Sends IT staff straight into the portal, signed in. */
export function PortalLauncher() {
  const [stalled, setStalled] = useState(false);

  useEffect(() => {
    const slow = setTimeout(() => setStalled(true), 5000);
    void openITPortal();
    return () => clearTimeout(slow);
  }, []);

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
