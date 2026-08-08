/**
 * Tablet lockdown for the check-in station.
 *
 * What this is honest about: a web page cannot lock a tablet. Anyone holding
 * the device can swipe to the home screen or open a new tab. Real lockdown is
 * an OS feature — Guided Access on iPad, Screen Pinning on Android, or a kiosk
 * launcher — and the admin screen says so.
 *
 * What this DOES do is make the app itself a dead end: no route but /kiosk
 * renders, the exit link needs the PIN, the screen stays awake, and the state
 * survives a reload or a power cycle. That covers the actual Sunday failure
 * mode, which is a bored eight-year-old and a volunteer who tapped the wrong
 * thing — not an attacker.
 */

const KEY = "ah-kiosk-locked";
const EVENT = "ah-kiosk-lock-change";

export function isKioskLocked(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(KEY) === "1";
  } catch {
    // Private mode / storage disabled. Not locked is the safe answer: the
    // alternative is a tablet nobody can get out of.
    return false;
  }
}

function broadcast() {
  window.dispatchEvent(new Event(EVENT));
}

export function lockKiosk() {
  try {
    window.localStorage.setItem(KEY, "1");
  } catch {}
  broadcast();
}

export function unlockKiosk() {
  try {
    window.localStorage.removeItem(KEY);
  } catch {}
  broadcast();
}

/** Subscribe to lock changes, including from another tab. */
export function onKioskLockChange(fn: () => void): () => void {
  window.addEventListener(EVENT, fn);
  window.addEventListener("storage", fn);
  return () => {
    window.removeEventListener(EVENT, fn);
    window.removeEventListener("storage", fn);
  };
}

/**
 * Keep the screen on. Wake Lock is dropped by the browser whenever the tab is
 * backgrounded and is NOT restored automatically, so it has to be re-taken on
 * every visibilitychange — otherwise the tablet dims halfway through the first
 * service and nobody knows why.
 */
export function keepAwake(): () => void {
  type Sentinel = { release: () => Promise<void>; addEventListener: (t: string, f: () => void) => void };
  const nav = navigator as Navigator & {
    wakeLock?: { request: (t: "screen") => Promise<Sentinel> };
  };
  if (!nav.wakeLock) return () => {};

  let sentinel: Sentinel | null = null;
  let cancelled = false;

  const take = async () => {
    if (cancelled || document.visibilityState !== "visible") return;
    try {
      sentinel = await nav.wakeLock!.request("screen");
    } catch {
      // Denied (low battery, no user gesture yet). Nothing to do — the next
      // visibility change tries again.
    }
  };

  const onVisible = () => {
    if (document.visibilityState === "visible") void take();
  };

  void take();
  document.addEventListener("visibilitychange", onVisible);

  return () => {
    cancelled = true;
    document.removeEventListener("visibilitychange", onVisible);
    void sentinel?.release().catch(() => {});
    sentinel = null;
  };
}

/** Go full-screen if the browser allows it. Silently fine when it doesn't. */
export async function enterFullscreen() {
  try {
    if (!document.fullscreenElement) await document.documentElement.requestFullscreen();
  } catch {}
}

export async function exitFullscreen() {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
  } catch {}
}
