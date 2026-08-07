"use client";

import { useEffect, useRef, useState } from "react";
import { TURNSTILE_SITE_KEY } from "@/lib/turnstile";

declare global {
  interface Window {
    turnstile?: {
      render: (
        el: HTMLElement,
        opts: {
          sitekey: string;
          callback: (token: string) => void;
          "expired-callback"?: () => void;
          "error-callback"?: () => void;
          theme?: "light" | "dark" | "auto";
        },
      ) => string;
      remove: (id: string) => void;
    };
  }
}

const SCRIPT = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

/**
 * Turnstile widget for public forms.
 *
 * Renders nothing when Turnstile isn't configured, so registration keeps
 * working while the keys are being set up — the server verification fails open
 * to match.
 */
export function Turnstile({ onToken }: { onToken: (token: string | null) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!TURNSTILE_SITE_KEY || !ref.current) return;
    let widgetId: string | undefined;
    let cancelled = false;

    function render() {
      if (cancelled || !ref.current || !window.turnstile) return;
      widgetId = window.turnstile.render(ref.current, {
        sitekey: TURNSTILE_SITE_KEY!,
        theme: "auto",
        callback: (token) => onToken(token),
        "expired-callback": () => onToken(null),
        "error-callback": () => {
          setFailed(true);
          onToken(null);
        },
      });
    }

    if (window.turnstile) {
      render();
    } else {
      const existing = document.querySelector(`script[src="${SCRIPT}"]`);
      if (existing) existing.addEventListener("load", render);
      else {
        const s = document.createElement("script");
        s.src = SCRIPT;
        s.async = true;
        s.defer = true;
        s.onload = render;
        s.onerror = () => setFailed(true);
        document.head.appendChild(s);
      }
    }

    return () => {
      cancelled = true;
      if (widgetId && window.turnstile) {
        try {
          window.turnstile.remove(widgetId);
        } catch {
          // widget already gone
        }
      }
    };
  }, [onToken]);

  if (!TURNSTILE_SITE_KEY) return null;

  return (
    <div>
      <div ref={ref} />
      {failed && (
        <p className="mt-1 text-xs text-ink-400">
          Verification couldn&apos;t load — you can still submit.
        </p>
      )}
    </div>
  );
}
