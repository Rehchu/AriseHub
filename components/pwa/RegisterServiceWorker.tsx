"use client";

import { useEffect } from "react";

// Registers the service worker once on mount (enables install + push). Renders
// nothing.
export function RegisterServiceWorker() {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }
  }, []);
  return null;
}
