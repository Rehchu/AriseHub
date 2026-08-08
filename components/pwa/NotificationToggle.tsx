"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Icon } from "@/components/shell/Icon";

function urlBase64ToUint8Array(base64: string) {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

// Enable/disable Web Push for this device. Stores the subscription under the
// signed-in profile; a small "Test" fires a push to yourself once enabled.
export function NotificationToggle({ profileId }: { profileId: string }) {
  const supabase = createClient();
  const [supported, setSupported] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    const ok = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
    setSupported(ok);
    if (ok) {
      navigator.serviceWorker.ready
        .then((reg) => reg.pushManager.getSubscription())
        .then((sub) => setEnabled(!!sub))
        .catch(() => {});
    }
  }, []);

  async function enable() {
    setBusy(true);
    setNote(null);
    try {
      const perm = await Notification.requestPermission();
      if (perm !== "granted") {
        setNote("Notifications were blocked. Enable them in your browser settings.");
        setBusy(false);
        return;
      }
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!),
      });
      const json = sub.toJSON();
      await supabase.from("push_subscriptions").upsert(
        {
          profile_id: profileId,
          endpoint: sub.endpoint,
          p256dh: json.keys?.p256dh,
          auth: json.keys?.auth,
          user_agent: navigator.userAgent,
        },
        { onConflict: "endpoint" },
      );
      setEnabled(true);
      setNote("Notifications enabled on this device.");
    } catch {
      setNote("Could not enable notifications.");
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    setBusy(true);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await supabase.from("push_subscriptions").delete().eq("endpoint", sub.endpoint);
        await sub.unsubscribe();
      }
      setEnabled(false);
      setNote(null);
    } finally {
      setBusy(false);
    }
  }

  async function test() {
    setNote("Sending a test…");
    const res = await fetch("/api/push/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        profileId,
        title: "AriseHub",
        body: "🔔 Push notifications are working!",
        url: "/dashboard",
      }),
    });
    const j = (await res.json().catch(() => ({}))) as {
      sent?: number;
      failed?: number;
      detail?: string;
      error?: string;
      failureStatuses?: number[];
    };
    if (!res.ok) {
      setNote(`Test failed: ${j.error ?? res.status}${j.detail ? ` — ${j.detail}` : ""}`);
    } else if (j.detail) {
      setNote(j.detail); // e.g. no devices subscribed
    } else if ((j.sent ?? 0) > 0) {
      setNote(`Sent to ${j.sent} device${j.sent === 1 ? "" : "s"}.`);
    } else {
      setNote(
        `Not delivered${j.failureStatuses?.length ? ` (push service returned ${j.failureStatuses.join(", ")})` : ""}. Try turning notifications off and on again.`,
      );
    }
  }

  if (!supported) return null;

  return (
    <div className="mt-2 border-t border-ink-700 px-3 pt-3">
      {!enabled ? (
        <button
          onClick={enable}
          disabled={busy}
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-ink-200 transition hover:bg-ink-700 hover:text-onaccent disabled:opacity-60"
        >
          <Icon name="help" /> Enable notifications
        </button>
      ) : (
        <div className="space-y-1">
          <button
            onClick={test}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-ink-200 transition hover:bg-ink-700 hover:text-onaccent"
          >
            <Icon name="send" /> Send test notification
          </button>
          <button
            onClick={disable}
            disabled={busy}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-xs text-ink-400 transition hover:text-ink-200"
          >
            Turn off notifications
          </button>
        </div>
      )}
      {note && <p className="px-3 pb-1 pt-1 text-xs text-ink-400">{note}</p>}
    </div>
  );
}
