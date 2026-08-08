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
  /** Bumped by "Try loading it again" to re-run the whole effect. */
  const [attempt, setAttempt] = useState(0);

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

    // Poll handle, so a pending wait is torn down with the component.
    let poll: ReturnType<typeof setInterval> | undefined;

    if (window.turnstile) {
      render();
    } else {
      const existing = document.querySelector(`script[src="${SCRIPT}"]`);
      if (existing) {
        // A previously-appended tag may already have fired `load`, and `load`
        // does not replay for a listener attached afterwards — so this branch
        // could wait forever and the widget would simply never appear. It
        // happens on any page that mounts a second form, or on a remount.
        // Watch for the global instead, which is the thing we actually need.
        existing.addEventListener("load", render);
        poll = setInterval(() => {
          if (window.turnstile) {
            clearInterval(poll);
            render();
          }
        }, 100);
        // Don't wait indefinitely on a script that failed for someone else.
        setTimeout(() => {
          if (!window.turnstile) {
            clearInterval(poll);
            if (!cancelled) setFailed(true);
          }
        }, 8000);
      } else {
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
      clearInterval(poll);
      if (widgetId && window.turnstile) {
        try {
          window.turnstile.remove(widgetId);
        } catch {
          // widget already gone
        }
      }
    };
    // `attempt` is in the deps so the retry button genuinely re-runs this.
  }, [onToken, attempt]);

  if (!TURNSTILE_SITE_KEY) return null;

  return (
    <div>
      <div ref={ref} />
      {failed && (
        // This used to say "you can still submit", which is false the moment a
        // Turnstile secret is configured: /api/forms/submit rejects a missing
        // token, so a guest was reassured, pressed Submit, and got "Please
        // complete the verification" with no widget on screen to complete. A
        // dead end, and their Connect Card details went with it.
        <div className="mt-1 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
          <p>The security check couldn&apos;t load, so this form can&apos;t be sent yet.</p>
          <button
            type="button"
            onClick={() => {
              setFailed(false);
              setAttempt((n) => n + 1);
            }}
            className="mt-1 font-semibold underline"
          >
            Try loading it again
          </button>
        </div>
      )}
    </div>
  );
}
