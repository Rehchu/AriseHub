// Web Push using ONLY Web Crypto — no Node APIs.
//
// The `web-push` npm package needs node:crypto (createECDH) and node:https,
// neither of which works reliably on Cloudflare Workers, so pushes silently
// failed there. This implements the two specs directly:
//   * RFC 8291 — Message Encryption for Web Push (aes128gcm)
//   * RFC 8292 — VAPID (voluntary application server identification)

function b64urlToBytes(s: string): Uint8Array {
  const padded = s.replace(/-/g, "+").replace(/_/g, "/").padEnd(s.length + ((4 - (s.length % 4)) % 4), "=");
  const bin = atob(padded);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function bytesToB64url(b: Uint8Array | ArrayBuffer): string {
  const bytes = b instanceof Uint8Array ? b : new Uint8Array(b);
  let bin = "";
  for (const x of bytes) bin += String.fromCharCode(x);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function concat(...arrs: Uint8Array[]): Uint8Array {
  const len = arrs.reduce((n, a) => n + a.length, 0);
  const out = new Uint8Array(len);
  let o = 0;
  for (const a of arrs) {
    out.set(a, o);
    o += a.length;
  }
  return out;
}

/** Build the JWK for a raw P-256 keypair (public: 65-byte point, private: 32-byte scalar). */
function p256Jwk(publicKey: Uint8Array, privateKey?: Uint8Array): JsonWebKey {
  // publicKey is 0x04 || X(32) || Y(32)
  const x = bytesToB64url(publicKey.slice(1, 33));
  const y = bytesToB64url(publicKey.slice(33, 65));
  const jwk: JsonWebKey = { kty: "EC", crv: "P-256", x, y, ext: true };
  if (privateKey) jwk.d = bytesToB64url(privateKey);
  return jwk;
}

async function hkdf(
  salt: Uint8Array,
  ikm: Uint8Array,
  info: Uint8Array,
  length: number,
): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey("raw", ikm as BufferSource, "HKDF", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "HKDF", hash: "SHA-256", salt: salt as BufferSource, info: info as BufferSource },
    key,
    length * 8,
  );
  return new Uint8Array(bits);
}

const enc = new TextEncoder();

/** VAPID Authorization header value for a push endpoint. */
async function vapidHeader(
  endpoint: string,
  publicKey: string,
  privateKey: string,
  subject: string,
): Promise<string> {
  const aud = new URL(endpoint).origin;
  const header = { typ: "JWT", alg: "ES256" };
  const payload = {
    aud,
    exp: Math.floor(Date.now() / 1000) + 12 * 60 * 60,
    sub: subject,
  };
  const signingInput = `${bytesToB64url(enc.encode(JSON.stringify(header)))}.${bytesToB64url(
    enc.encode(JSON.stringify(payload)),
  )}`;

  const pub = b64urlToBytes(publicKey);
  const priv = b64urlToBytes(privateKey);
  const key = await crypto.subtle.importKey(
    "jwk",
    p256Jwk(pub, priv),
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    key,
    enc.encode(signingInput),
  );
  return `vapid t=${signingInput}.${bytesToB64url(sig)}, k=${publicKey}`;
}

/** Encrypt a payload for a subscription per RFC 8291 (aes128gcm). */
async function encryptPayload(
  payload: string,
  p256dh: string,
  auth: string,
): Promise<Uint8Array> {
  const uaPublic = b64urlToBytes(p256dh); // 65 bytes
  const authSecret = b64urlToBytes(auth); // 16 bytes

  // Ephemeral (application server) ECDH keypair.
  const asKeys = await crypto.subtle.generateKey(
    { name: "ECDH", namedCurve: "P-256" },
    true,
    ["deriveBits"],
  );
  const asPublicRaw = new Uint8Array(await crypto.subtle.exportKey("raw", asKeys.publicKey));

  const uaKey = await crypto.subtle.importKey(
    "jwk",
    p256Jwk(uaPublic),
    { name: "ECDH", namedCurve: "P-256" },
    false,
    [],
  );
  const shared = new Uint8Array(
    await crypto.subtle.deriveBits({ name: "ECDH", public: uaKey }, asKeys.privateKey, 256),
  );

  // ikm = HKDF(salt=authSecret, ikm=shared, info="WebPush: info\0"||ua||as)
  const ikmInfo = concat(enc.encode("WebPush: info\0"), uaPublic, asPublicRaw);
  const ikm = await hkdf(authSecret, shared, ikmInfo, 32);

  const salt = crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(salt, ikm, enc.encode("Content-Encoding: aes128gcm\0"), 16);
  const nonce = await hkdf(salt, ikm, enc.encode("Content-Encoding: nonce\0"), 12);

  // Plaintext gets a 0x02 padding delimiter (final record).
  const plaintext = concat(enc.encode(payload), new Uint8Array([2]));
  const aesKey = await crypto.subtle.importKey("raw", cek as BufferSource, "AES-GCM", false, [
    "encrypt",
  ]);
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce as BufferSource }, aesKey, plaintext as BufferSource),
  );

  // Header: salt(16) | record size(4, BE) | idlen(1) | as_public(65)
  const rs = new Uint8Array(4);
  new DataView(rs.buffer).setUint32(0, 4096);
  return concat(salt, rs, new Uint8Array([asPublicRaw.length]), asPublicRaw, ciphertext);
}

export interface PushSubscriptionRecord {
  endpoint: string;
  p256dh: string;
  auth: string;
}

export interface SendResult {
  ok: boolean;
  status: number;
  /** Subscription is gone — caller should delete it. */
  expired: boolean;
  /** What the push service said. Apple puts a reason here; we used to bin it. */
  detail?: string;
  /** True when a retry was needed and worked. */
  retried?: boolean;
}

/**
 * Send one Web Push message. Never throws — returns a status the caller can act on.
 *
 * Retries once on 5xx. A 525 is Cloudflare's "TLS handshake to the upstream
 * failed", which is a hop between our Worker and Apple rather than anything
 * wrong with the subscription — one iPad saw it while an iPhone on the same
 * push service and the same code path was fine. That class of failure is
 * transient and a single retry is the correct response to it. 4xx is not
 * retried: those are our fault or the subscription's, and repeating them just
 * doubles the load.
 */
export async function sendPush(
  sub: PushSubscriptionRecord,
  payload: string,
  vapid: { publicKey: string; privateKey: string; subject: string },
  ttl = 60 * 60 * 24,
): Promise<SendResult> {
  const attempt = async (): Promise<SendResult> => {
    const body = await encryptPayload(payload, sub.p256dh, sub.auth);
    const auth = await vapidHeader(sub.endpoint, vapid.publicKey, vapid.privateKey, vapid.subject);

    const res = await fetch(sub.endpoint, {
      method: "POST",
      headers: {
        Authorization: auth,
        "Content-Encoding": "aes128gcm",
        "Content-Type": "application/octet-stream",
        TTL: String(ttl),
      },
      body: body as BodyInit,
    });
    // Read the body on failure. The push services explain themselves here and
    // we were discarding it, which left a bare status number as the only clue.
    let detail: string | undefined;
    if (!res.ok) {
      detail = (await res.text().catch(() => "")).trim().slice(0, 300) || undefined;
    }
    return {
      ok: res.ok,
      status: res.status,
      expired: res.status === 404 || res.status === 410,
      detail,
    };
  };

  try {
    const first = await attempt();
    if (first.ok || first.status < 500) return first;
    await new Promise((r) => setTimeout(r, 400));
    const second = await attempt();
    return { ...second, retried: true };
  } catch (e) {
    return {
      ok: false,
      status: 0,
      expired: false,
      detail: e instanceof Error ? e.message : "the request never completed",
    };
  }
}
