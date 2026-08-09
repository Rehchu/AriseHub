// Relays a Web Push request to Apple, because Cloudflare cannot.
//
// Every request from the AriseHub Worker to Apple's push network comes back
// 525 — Cloudflare's "TLS handshake to the upstream failed". Proven not to be
// our request: a bare GET to web.push.apple.com, a POST to the same, and a GET
// to api.push.apple.com all fail identically in ~110ms, while fcm.googleapis.com
// and updates.push.services.mozilla.com answer normally from the same Worker on
// the same request. Apple itself is healthy — it answers a normal client in
// 0.7s with a valid certificate, and resolves through Akamai to Apple's own
// 17.188.0.0/16, so nothing is proxying it.
//
// Supabase Edge Functions run on Deno Deploy rather than Cloudflare, so they
// have a different route to Apple. This function does nothing but carry an
// already-signed request across that hop.
//
// It deliberately does NOT do the crypto. The VAPID signature and the RFC 8291
// payload are built in the Worker (lib/webpush.ts) and arrive here finished, so
// there is exactly one implementation of the hard part and the private key
// never leaves Cloudflare.

interface RelayRequest {
  endpoint?: unknown;
  authorization?: unknown;
  ttl?: unknown;
  body_b64?: unknown;
}

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });

/** Apple push hosts only. Without this the function is an open proxy that
 *  anyone holding the key could point at any host on the internet. */
function allowedHost(endpoint: string): boolean {
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    return false;
  }
  return url.protocol === "https:" && /(^|\.)push\.apple\.com$/.test(url.hostname);
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  let payload: RelayRequest;
  try {
    payload = await req.json();
  } catch {
    return json({ error: "body must be JSON" }, 400);
  }

  const { endpoint, authorization, ttl, body_b64 } = payload;
  if (typeof endpoint !== "string" || typeof authorization !== "string" || typeof body_b64 !== "string") {
    return json({ error: "endpoint, authorization and body_b64 are required" }, 400);
  }
  if (!allowedHost(endpoint)) {
    return json({ error: "endpoint host is not an Apple push host" }, 400);
  }

  let body: Uint8Array;
  try {
    const bin = atob(body_b64);
    body = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) body[i] = bin.charCodeAt(i);
  } catch {
    return json({ error: "body_b64 is not valid base64" }, 400);
  }

  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: authorization,
        "Content-Encoding": "aes128gcm",
        "Content-Type": "application/octet-stream",
        TTL: String(typeof ttl === "number" ? ttl : 86400),
      },
      body,
    });

    // Apple explains refusals in the body. Passed back so the Worker can log
    // the real reason rather than a bare status, and so 404/410 still prune.
    const detail = res.ok ? "" : (await res.text().catch(() => "")).trim().slice(0, 300);
    return json({ status: res.status, detail: detail || null });
  } catch (e) {
    return json(
      { status: 0, detail: e instanceof Error ? e.message : "the relayed request never completed" },
      200,
    );
  }
});
