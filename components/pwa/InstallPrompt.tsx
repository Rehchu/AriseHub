"use client";

import { useEffect, useState } from "react";
import { Logo } from "@/components/Logo";
import { Icon } from "@/components/shell/Icon";
import { Modal } from "@/components/ui/Modal";

interface BIPEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: string }>;
}

type Platform = "ios" | "android-chrome" | "desktop" | "other";

function detectPlatform(): Platform {
  if (typeof navigator === "undefined") return "other";
  const ua = navigator.userAgent;
  const iOS = /iPad|iPhone|iPod/.test(ua) || (ua.includes("Mac") && "ontouchend" in document);
  if (iOS) return "ios";
  if (/Android/.test(ua)) return "android-chrome";
  return "desktop";
}

function isStandalone() {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    // iOS Safari
    (window.navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

// Shows an install affordance tailored to the OS. Chrome/Edge (Android, Windows,
// macOS) use the native beforeinstallprompt; iOS/iPadOS Safari gets step-by-step
// Add-to-Home-Screen instructions (Apple exposes no install API).
export function InstallPrompt() {
  const [deferred, setDeferred] = useState<BIPEvent | null>(null);
  const [platform, setPlatform] = useState<Platform>("other");
  const [open, setOpen] = useState(false);
  const [installed, setInstalled] = useState(true); // assume until we know

  useEffect(() => {
    setPlatform(detectPlatform());
    setInstalled(isStandalone());
    if (localStorage.getItem("ah-install-dismissed") === "1") return;

    const onBIP = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BIPEvent);
    };
    // Named, so it can actually be removed. This was an inline arrow with no
    // matching removeEventListener, so every mount left another `appinstalled`
    // handler attached to window holding a reference to a dead component's
    // setState.
    const onInstalled = () => setInstalled(true);
    window.addEventListener("beforeinstallprompt", onBIP);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBIP);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (installed) return null;
  // Only surface a banner when we can actually help: a native prompt exists, or
  // it's iOS (manual steps). Other desktop browsers without the event: stay quiet.
  const canPrompt = !!deferred;
  const iosManual = platform === "ios";
  if (!canPrompt && !iosManual) return null;

  function dismiss() {
    localStorage.setItem("ah-install-dismissed", "1");
    setDeferred(null);
    setOpen(false);
    setInstalled(true); // hide for this session
  }

  async function install() {
    if (deferred) {
      await deferred.prompt();
      await deferred.userChoice;
      setDeferred(null);
      setInstalled(true);
    } else {
      setOpen(true); // iOS instructions
    }
  }

  return (
    <>
      {/* Sits ABOVE the bottom nav on phones, not on top of it. Pinned to
          bottom-0 with z-40 this banner covered the whole nav bar (z-30) — the
          app's primary navigation — until someone found the little x. */}
      <div className="safe-x fixed inset-x-0 bottom-[calc(3.5rem+env(safe-area-inset-bottom))] z-40 border-t border-ink-100 bg-white p-3 shadow-lg sm:inset-x-auto sm:right-4 sm:bottom-[calc(4rem+env(safe-area-inset-bottom))] sm:max-w-sm sm:rounded-2xl sm:border lg:bottom-4">
        <div className="flex items-center gap-3">
          <Logo size={32} />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-ink-900">Install AriseHub</p>
            <p className="text-xs text-ink-500">Add it to your home screen for quick access & notifications.</p>
          </div>
          <button onClick={install} className="shrink-0 rounded-lg bg-accent px-3 py-1.5 text-sm font-semibold text-onaccent hover:bg-accent-strong">
            Install
          </button>
          <button onClick={dismiss} className="shrink-0 text-ink-400 hover:text-ink-700" aria-label="Dismiss">
            <Icon name="x" size={18} />
          </button>
        </div>
      </div>

      {open && (
        <Modal onClose={() => setOpen(false)} align="end" className="sm:items-center sm:p-4" label="Add to Home Screen">
          <div className="w-full max-w-sm rounded-t-2xl bg-white p-5 sm:rounded-2xl">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-display text-lg font-bold">Add to Home Screen</h2>
              <button onClick={() => setOpen(false)} aria-label="Close" className="text-ink-400"><Icon name="x" /></button>
            </div>
            <ol className="space-y-3 text-sm text-ink-700">
              <li className="flex gap-3">
                <Step n={1} />
                <span>Tap the <span className="font-medium">Share</span> button in Safari&apos;s toolbar (the square with an up-arrow).</span>
              </li>
              <li className="flex gap-3">
                <Step n={2} />
                <span>Scroll down and tap <span className="font-medium">Add to Home Screen</span>.</span>
              </li>
              <li className="flex gap-3">
                <Step n={3} />
                <span>Tap <span className="font-medium">Add</span> — then open AriseHub from your home screen. Notifications can be enabled from there.</span>
              </li>
            </ol>
            <button onClick={dismiss} className="mt-5 w-full rounded-lg bg-ink-100 py-2.5 text-sm font-medium text-ink-700">
              Got it
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}

function Step({ n }: { n: number }) {
  return (
    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent text-xs font-bold text-onaccent">
      {n}
    </span>
  );
}
