// AriseHub service worker — installability + Web Push.
const CACHE = "arisehub-v3";
const SHELL = ["/dashboard", "/manifest.webmanifest", "/icon-192.png"];

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL).catch(() => {})));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))),
    ),
  );
  self.clients.claim();
});

// Network-first for navigations (fresh data when online, cached shell offline).
self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
          return res;
        })
        .catch(() => caches.match(req).then((r) => r || caches.match("/dashboard"))),
    );
  }
});

// Incoming push → show a notification.
self.addEventListener("push", (event) => {
  let payload = { title: "AriseHub", body: "You have a new notification.", url: "/dashboard" };
  try {
    if (event.data) payload = { ...payload, ...event.data.json() };
  } catch {
    if (event.data) payload.body = event.data.text();
  }
  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      data: { url: payload.url || "/dashboard" },
      tag: payload.tag,
    }),
  );
});

function urlB64ToUint8Array(b64) {
  const padded = (b64 + "=".repeat((4 - (b64.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(padded);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

// The browser rotates push endpoints whenever it feels like it. Without this
// the old endpoint 410s on the next send, the server prunes the row, and the
// device silently stops receiving forever — while the settings page still says
// notifications are on, because that state is read from the browser rather than
// the database. Exactly the failure that hid the Apple outage for days.
self.addEventListener("pushsubscriptionchange", (event) => {
  event.waitUntil(
    (async () => {
      const old = event.oldSubscription || (await self.registration.pushManager.getSubscription());

      let key = old && old.options && old.options.applicationServerKey;
      if (!key) {
        // Safari does not populate oldSubscription. The VAPID public key is
        // public by definition — it is shipped to every client already.
        const res = await fetch("/api/push/public-key");
        if (!res.ok) return;
        const body = await res.json();
        if (!body.key) return;
        key = urlB64ToUint8Array(body.key);
      }

      const fresh =
        event.newSubscription ||
        (await self.registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: key,
        }));

      const json = fresh.toJSON();
      await fetch("/api/push/rotate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          oldEndpoint: old ? old.endpoint : null,
          endpoint: fresh.endpoint,
          p256dh: json.keys && json.keys.p256dh,
          auth: json.keys && json.keys.auth,
        }),
      });
    })().catch(() => {
      // Nothing useful to do here — the next enable() from the settings page
      // repairs it, and throwing would only surface in the SW console.
    }),
  );
});

// Clicking a notification focuses/opens the target URL.
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url || "/dashboard";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if ("focus" in client) {
          client.navigate(url);
          return client.focus();
        }
      }
      return self.clients.openWindow(url);
    }),
  );
});
