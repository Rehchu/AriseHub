"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Icon } from "@/components/shell/Icon";
import { Modal } from "@/components/ui/Modal";
import {
  isKioskLocked,
  lockKiosk,
  unlockKiosk,
  onKioskLockChange,
  keepAwake,
  enterFullscreen,
  exitFullscreen,
} from "@/lib/kiosk-lock";

/**
 * The lock control that lives in the kiosk footer.
 *
 * Locked, it: keeps the screen awake, goes full-screen, blocks every in-app
 * link that leads out of /kiosk, and warns before a reload. Unlocking needs the
 * exit PIN from Admin → Check-in (if one is set).
 */
export function KioskLock() {
  const supabase = createClient();
  const [locked, setLocked] = useState(false);
  const [asking, setAsking] = useState(false);
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [pinConfigured, setPinConfigured] = useState<boolean | null>(null);

  // Read the persisted state after mount. Doing it during render would make the
  // server and client disagree and React would throw the markup away.
  useEffect(() => {
    setLocked(isKioskLocked());
    return onKioskLockChange(() => setLocked(isKioskLocked()));
  }, []);

  useEffect(() => {
    supabase.rpc("kiosk_exit_pin_is_set").then(({ data }) => setPinConfigured(data === true));
  }, [supabase]);

  // Screen stays on, and the tab goes full-screen, only while locked.
  useEffect(() => {
    if (!locked) return;
    const release = keepAwake();
    return release;
  }, [locked]);

  // Nothing in the app should be reachable from here. The kiosk page has no
  // shell, but the browser's back button and any stray link still are — so
  // intercept both.
  useEffect(() => {
    if (!locked) return;

    const onClick = (e: MouseEvent) => {
      const a = (e.target as HTMLElement | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!a) return;
      const href = a.getAttribute("href") ?? "";
      if (href.startsWith("#")) return;
      const url = new URL(a.href, window.location.href);
      if (url.origin === window.location.origin && url.pathname === "/kiosk") return;
      e.preventDefault();
      e.stopPropagation();
      setAsking(true);
    };

    // Back/forward out of the kiosk: put the entry straight back, so the stack
    // never empties and the tablet cannot reverse out of the check-in page.
    const onPop = () => {
      window.history.pushState(null, "", "/kiosk");
    };

    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };

    window.history.pushState(null, "", "/kiosk");
    document.addEventListener("click", onClick, true);
    window.addEventListener("popstate", onPop);
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => {
      document.removeEventListener("click", onClick, true);
      window.removeEventListener("popstate", onPop);
      window.removeEventListener("beforeunload", onBeforeUnload);
    };
  }, [locked]);

  const lock = useCallback(async () => {
    lockKiosk();
    setLocked(true);
    await enterFullscreen();
  }, []);

  async function tryUnlock(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { data, error: rpcError } = await supabase.rpc("kiosk_check_exit_pin", { pin });
    setBusy(false);
    if (rpcError) return setError(rpcError.message);
    if (data !== true) {
      setPin("");
      return setError("That PIN isn't right.");
    }
    unlockKiosk();
    setLocked(false);
    setAsking(false);
    setPin("");
    await exitFullscreen();
  }

  if (!locked) {
    return (
      <button
        onClick={lock}
        className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 font-medium text-ink-500 hover:bg-ink-100 hover:text-ink-800"
      >
        <Icon name="badge" size={14} /> Lock this tablet
      </button>
    );
  }

  return (
    <>
      <button
        onClick={() => setAsking(true)}
        className="inline-flex items-center gap-1.5 rounded-lg bg-ink-100 px-2 py-1 font-medium text-ink-600"
      >
        <Icon name="badge" size={14} /> Locked — tap to unlock
      </button>

      {asking && (
        <Modal
          onClose={() => {
            setAsking(false);
            setPin("");
            setError(null);
          }}
          align="center"
          className="p-4"
          label="Unlock this tablet"
        >
          <form
            onSubmit={tryUnlock}
            className="w-full max-w-xs space-y-3 rounded-2xl bg-white p-5 text-left shadow-2xl"
          >
            <h2 className="font-display text-lg font-bold text-ink-900">Unlock this tablet</h2>
            <p className="text-sm text-ink-500">
              {pinConfigured === false
                ? "No exit PIN has been set, so this just leaves kiosk mode. Set one in Admin → Check-in."
                : "Enter the exit PIN to leave the check-in station."}
            </p>
            {pinConfigured !== false && (
              <input
                className="ah-input text-center text-2xl tracking-[0.4em]"
                inputMode="numeric"
                autoComplete="off"
                pattern="[0-9]*"
                maxLength={8}
                placeholder="••••"
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
                autoFocus
              />
            )}
            {error && (
              <p className="rounded-lg bg-brand-50 px-3 py-2 text-sm text-brand-700">{error}</p>
            )}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setAsking(false);
                  setPin("");
                  setError(null);
                }}
                className="flex-1 rounded-lg bg-ink-100 py-2.5 text-sm font-medium text-ink-700"
              >
                Stay locked
              </button>
              <button
                type="submit"
                disabled={busy || (pinConfigured !== false && pin.length < 4)}
                className="flex-1 rounded-lg bg-accent py-2.5 text-sm font-semibold text-onaccent hover:bg-accent-strong disabled:opacity-50"
              >
                {busy ? "Checking…" : "Unlock"}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
