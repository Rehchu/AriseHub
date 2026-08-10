"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Icon } from "@/components/shell/Icon";

function urlBase64ToUint8Array(base64: string) {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

interface Diagnostics {
  secure: boolean;
  swSupported: boolean;
  pushSupported: boolean;
  notificationSupported: boolean;
  installed: boolean;
  ios: boolean;
  permission: NotificationPermission | "unknown";
  swRegistered: boolean;
  subscribed: boolean;
  vapidConfigured: boolean;
}

/**
 * Notification settings with real diagnostics.
 *
 * "Notifications don't work" has many possible causes — a non-installed PWA on
 * iOS, a denied permission, a missing service worker — and each needs a
 * different fix. Rather than a button that silently does nothing, this shows
 * exactly which requirement isn't met.
 */
export function NotificationSettings({
  profileId,
  devices,
  canTest = false,
}: {
  profileId: string;
  devices: {
    id: string;
    user_agent: string | null;
    created_at: string;
    last_sent_at?: string | null;
    last_status?: string | null;
  }[];
  canTest?: boolean;
}) {
  // Memoised so check() can depend on it without re-running every render.
  const supabase = useMemo(() => createClient(), []);
  const [d, setD] = useState<Diagnostics | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const check = useCallback(async () => {
    const ua = navigator.userAgent;
    const ios = /iPad|iPhone|iPod/.test(ua) || (ua.includes("Mac") && "ontouchend" in document);
    const installed =
      window.matchMedia("(display-mode: standalone)").matches ||
      (window.navigator as unknown as { standalone?: boolean }).standalone === true;

    let swRegistered = false;
    let subscribed = false;
    if ("serviceWorker" in navigator) {
      try {
        const reg = await navigator.serviceWorker.getRegistration();
        swRegistered = !!reg;
        const sub = reg ? await reg.pushManager?.getSubscription() : null;
        if (sub) {
          // A browser subscription on its own is not enough to say we are
          // registered. Both send paths delete the row on 404/410, so this can
          // outlive the row behind it — and trusting the browser alone is what
          // let a device sit here insisting notifications were on while it
          // received nothing. If the row is gone, show the enable button again;
          // pressing it re-upserts the same subscription.
          const { data } = await supabase
            .from("push_subscriptions")
            .select("id")
            .eq("endpoint", sub.endpoint)
            .maybeSingle();
          subscribed = !!data;
        }
      } catch {
        // leave as false
      }
    }

    setD({
      secure: window.isSecureContext,
      swSupported: "serviceWorker" in navigator,
      pushSupported: "PushManager" in window,
      notificationSupported: "Notification" in window,
      installed,
      ios,
      permission: "Notification" in window ? Notification.permission : "unknown",
      swRegistered,
      subscribed,
      vapidConfigured: !!process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
    });
  }, [supabase]);

  useEffect(() => {
    void check();
  }, [check]);

  async function enable() {
    setBusy(true);
    setError(null);
    setNote(null);
    try {
      // Permission FIRST. The prompt needs transient user activation, and
      // awaiting the service-worker promises can consume it on iOS and Safari —
      // precisely the platform where this is hardest to get working, and where
      // the failure looks like the button doing nothing at all.
      const perm = await Notification.requestPermission();
      if (perm !== "granted") {
        setError(
          perm === "denied"
            ? "Notifications are blocked for this site. You'll need to allow them in your browser or OS settings, then come back."
            : "Permission wasn't granted.",
        );
        setBusy(false);
        await check();
        return;
      }

      // Subscribing against a missing or inactive registration is a common
      // silent failure, so make sure the worker is really running.
      let reg = await navigator.serviceWorker.getRegistration();
      if (!reg) {
        reg = await navigator.serviceWorker.register("/sw.js");
      }
      // serviceWorker.ready never rejects and never times out. A worker that
      // registers but never activates would hang here forever, leaving the
      // button on "Enabling…" with nothing to explain it.
      await Promise.race([
        navigator.serviceWorker.ready,
        new Promise<never>((_, reject) =>
          setTimeout(
            () =>
              reject(
                new Error("The service worker didn't finish starting up. Reload the page and try again."),
              ),
            10_000,
          ),
        ),
      ]);

      const key = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
      if (!key) {
        setError("Push isn't configured on the server (missing VAPID key).");
        setBusy(false);
        return;
      }

      const sub =
        (await reg.pushManager.getSubscription()) ??
        (await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(key),
        }));

      const json = sub.toJSON();
      const { error: dbErr } = await supabase.from("push_subscriptions").upsert(
        {
          profile_id: profileId,
          endpoint: sub.endpoint,
          p256dh: json.keys?.p256dh,
          auth: json.keys?.auth,
          user_agent: navigator.userAgent.slice(0, 200),
        },
        { onConflict: "endpoint" },
      );
      if (dbErr) {
        setError(`Couldn't save this device: ${dbErr.message}`);
        setBusy(false);
        return;
      }

      setNote("This device is now registered for notifications.");
      await check();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not enable notifications.");
    } finally {
      setBusy(false);
    }
  }

  async function test() {
    setNote("Sending…");
    setError(null);
    const res = await fetch("/api/push/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        profileId,
        title: "AriseHub",
        body: "🔔 Notifications are working!",
        url: "/dashboard",
      }),
    });
    const j = (await res.json().catch(() => ({}))) as {
      sent?: number;
      failed?: number;
      detail?: string;
      error?: string;
      retried?: number;
      failures?: { status: number; service: string; detail?: string }[];
    };
    if (!res.ok) setError(j.error ?? `Failed (${res.status})`);
    else if (j.detail) setNote(j.detail);
    else if ((j.sent ?? 0) > 0) {
      setNote(
        `Sent to ${j.sent} device${j.sent === 1 ? "" : "s"}.` +
          (j.retried ? " (One needed a second attempt — the first was refused by the network.)" : ""),
      );
    } else {
      // Name the service and quote what it said. "push service said 525" gave
      // nobody anything to act on — and 525 is Cloudflare's code for a failed
      // handshake to the upstream, not something the push service returned.
      const f = j.failures?.[0];
      setError(
        f
          ? `Not delivered. ${f.service} returned ${f.status}${f.detail ? ` — ${f.detail}` : ""}.` +
            (f.status >= 500
              ? " That's a network fault between us and the push service rather than a problem with this device; it usually clears on its own."
              : "")
          : "Not delivered.",
      );
    }
  }

  // Broadcast test — ping every registered device across everyone, and report
  // who came back. This is the "is it working for the whole team?" check, so it
  // doesn't test a device that isn't this one's; it tests all of them at once.
  async function testEveryone() {
    setNote("Sending to everyone…");
    setError(null);
    const res = await fetch("/api/push/broadcast", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: "/dashboard" }),
    });
    const j = (await res.json().catch(() => ({}))) as {
      people?: number;
      peopleReached?: number;
      devices?: number;
      sent?: number;
      failed?: number;
      pruned?: number;
      detail?: string;
      error?: string;
    };
    if (!res.ok) return setError(j.error ?? `Failed (${res.status})`);
    if (j.detail) return setNote(j.detail);
    const parts = [
      `Sent to ${j.sent} of ${j.devices} device${j.devices === 1 ? "" : "s"}`,
      `across ${j.peopleReached} of ${j.people} ${j.people === 1 ? "person" : "people"}.`,
    ];
    if (j.failed) parts.push(`${j.failed} failed.`);
    if (j.pruned) parts.push(`${j.pruned} dead registration${j.pruned === 1 ? "" : "s"} cleared.`);
    setNote(parts.join(" "));
  }

  async function disable() {
    setBusy(true);
    const reg = await navigator.serviceWorker.getRegistration();
    const sub = await reg?.pushManager.getSubscription();
    if (sub) {
      await supabase.from("push_subscriptions").delete().eq("endpoint", sub.endpoint);
      await sub.unsubscribe();
    }
    setBusy(false);
    setNote(null);
    await check();
  }

  if (!d) {
    return <div className="mx-auto max-w-2xl px-4 py-8 text-ink-400 sm:px-6">Checking…</div>;
  }

  // The single most important blocker, if there is one.
  const blocker = !d.secure
    ? "This page must be served over HTTPS."
    : !d.notificationSupported || !d.pushSupported
      ? "This browser doesn't support push notifications."
      : d.ios && !d.installed
        ? "ios-install"
        : d.permission === "denied"
          ? "blocked"
          : null;

  return (
    <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6">
      <h1 className="font-display text-2xl font-bold text-ink-900">Notifications</h1>
      <p className="mt-1 text-ink-500">
        Get told when you&apos;re scheduled, messaged, or assigned something.
      </p>

      {/* --- The blocker, explained --- */}
      {blocker === "ios-install" && (
        <div className="mt-6 rounded-xl border border-amber-200 bg-amber-50 p-4">
          <h2 className="font-display font-semibold text-amber-900">
            On iPhone and iPad, install the app first
          </h2>
          <p className="mt-1 text-sm text-amber-800">
            Apple only allows notifications from apps added to the Home Screen — a
            Safari tab can&apos;t receive them. This takes about 15 seconds:
          </p>
          <ol className="mt-3 space-y-2 text-sm text-amber-900">
            <li>
              <strong>1.</strong> Tap the <strong>Share</strong> button (the square
              with an arrow pointing up) in Safari&apos;s toolbar
            </li>
            <li>
              <strong>2.</strong> Scroll down and tap <strong>Add to Home Screen</strong>
            </li>
            <li>
              <strong>3.</strong> Tap <strong>Add</strong>
            </li>
            <li>
              <strong>4.</strong> Open <strong>AriseHub</strong> from your Home Screen
              and come back to this page
            </li>
          </ol>
          <p className="mt-3 text-xs text-amber-700">
            It must be opened from the Home Screen icon — not Safari — for this to work.
          </p>
        </div>
      )}

      {blocker === "blocked" && (
        <div className="mt-6 rounded-xl border border-brand-200 bg-brand-50 p-4">
          <h2 className="font-display font-semibold text-brand-800">
            Notifications are blocked for this site
          </h2>
          <p className="mt-1 text-sm text-brand-700">
            You (or the browser) previously denied permission, and it can&apos;t be
            re-requested from the page. Allow it in settings, then reload:
          </p>
          <ul className="mt-2 space-y-1 text-sm text-brand-700">
            <li>
              <strong>Chrome / Edge:</strong> tap the padlock in the address bar →
              Notifications → Allow
            </li>
            <li>
              <strong>Android:</strong> Settings → Apps → your browser → Notifications
            </li>
            <li>
              <strong>iPhone:</strong> Settings → Notifications → AriseHub → Allow
            </li>
          </ul>
        </div>
      )}

      {typeof blocker === "string" && blocker !== "ios-install" && blocker !== "blocked" && (
        <p className="mt-6 rounded-xl bg-brand-50 px-4 py-3 text-sm text-brand-700">{blocker}</p>
      )}

      {/* --- Main action --- */}
      {!blocker && (
        <div className="mt-6 rounded-xl border border-ink-100 bg-white p-4">
          {d.subscribed ? (
            <>
              <p className="flex items-center gap-2 font-medium text-emerald-700">
                <Icon name="check" size={18} /> Notifications are on for this device
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {canTest && (
                  <button
                    onClick={test}
                    className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-onaccent hover:bg-accent-strong"
                  >
                    Send a test
                  </button>
                )}
                <button
                  onClick={disable}
                  disabled={busy}
                  className="rounded-lg bg-ink-100 px-4 py-2 text-sm font-medium text-ink-700 hover:bg-ink-200"
                >
                  Turn off on this device
                </button>
              </div>
            </>
          ) : (
            <>
              <p className="font-medium text-ink-900">Notifications are off on this device</p>
              <p className="mt-1 text-sm text-ink-500">
                Turn them on to hear about your schedule and messages.
              </p>
              <button
                onClick={enable}
                disabled={busy}
                className="mt-3 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-onaccent hover:bg-accent-strong disabled:opacity-60"
              >
                {busy ? "Enabling…" : "Turn on notifications"}
              </button>
            </>
          )}
        </div>
      )}

      {/* Team-wide test — for IT / Super Admin, independent of whether THIS
          device is subscribed, because the point is to reach the others. */}
      {canTest && (
        <div className="mt-3 rounded-xl border border-ink-100 bg-white p-4">
          <p className="font-medium text-ink-900">Test everyone&apos;s devices</p>
          <p className="mt-1 text-sm text-ink-500">
            Sends a test notification to every device that has notifications
            turned on, across everyone — then reports how many came back. Use
            this to confirm the whole team is receiving.
          </p>
          <button
            onClick={testEveryone}
            className="mt-3 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-onaccent hover:bg-accent-strong"
          >
            Send a test to everyone
          </button>
        </div>
      )}

      {note && (
        <p className="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{note}</p>
      )}
      {error && (
        <p className="mt-3 rounded-lg bg-brand-50 px-3 py-2 text-sm text-brand-700">{error}</p>
      )}

      {/* --- Registered devices --- */}
      {devices.length > 0 && (
        <div className="mt-8">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-ink-400">
            Your registered devices ({devices.length})
          </h2>
          <div className="mt-2 space-y-1">
            {devices.map((dev) => (
              <div key={dev.id} className="rounded-lg bg-ink-50 px-3 py-2 text-xs">
                <p className="truncate text-ink-600">
                  {dev.user_agent?.slice(0, 90) ?? "Unknown device"} ·{" "}
                  {new Date(dev.created_at).toLocaleDateString()}
                </p>
                {/* Delivery state per device, so "is THIS one receiving?" is
                    answered here instead of by someone reading the database. */}
                <p
                  className={
                    dev.last_status?.startsWith("failed")
                      ? "mt-0.5 font-medium text-brand-700"
                      : "mt-0.5 text-ink-400"
                  }
                >
                  {dev.last_status
                    ? `${dev.last_status}${
                        dev.last_sent_at
                          ? ` · ${new Date(dev.last_sent_at).toLocaleString(undefined, {
                              month: "short",
                              day: "numeric",
                              hour: "numeric",
                              minute: "2-digit",
                            })}`
                          : ""
                      }`
                    : "nothing sent to this device yet"}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* --- Diagnostics, for when it still won't work --- */}
      <details className="mt-8">
        <summary className="cursor-pointer text-sm font-medium text-ink-500">
          Technical details
        </summary>
        <div className="mt-2 space-y-1 rounded-xl bg-ink-50 p-3 text-xs">
          <Row label="Secure (HTTPS)" ok={d.secure} />
          <Row label="Service workers supported" ok={d.swSupported} />
          <Row label="Push supported" ok={d.pushSupported} />
          <Row label="Service worker registered" ok={d.swRegistered} />
          <Row label="Installed as an app" ok={d.installed} note={d.ios ? "required on iOS" : "optional"} />
          <Row label="Push key configured" ok={d.vapidConfigured} />
          <Row label="Subscribed" ok={d.subscribed} />
          <p className="pt-1 text-ink-500">Permission: {d.permission}</p>
        </div>
      </details>

      <p className="mt-6 text-sm text-ink-400">
        <Link href="/dashboard" className="text-brand-600 underline">
          Back to Home
        </Link>
      </p>
    </div>
  );
}

function Row({ label, ok, note }: { label: string; ok: boolean; note?: string }) {
  return (
    <p className="flex items-center gap-2">
      <span className={ok ? "text-emerald-600" : "text-brand-500"}>{ok ? "✓" : "✗"}</span>
      <span className="text-ink-700">{label}</span>
      {note && <span className="text-ink-400">({note})</span>}
    </p>
  );
}
