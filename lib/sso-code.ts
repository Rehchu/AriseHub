// Short-lived signed hand-off code for AriseHub → IT portal sign-in.
//
// Every other mechanism was blocked by the environment:
//   - cross-origin fetch  → browsers refuse the Set-Cookie
//   - URL fragment        → depends on SPA JS the service worker may cache
//   - cross-site POST     → Cloudflare's edge rejects it as CSRF (403)
//
// So AriseHub mints a code that says only "this email is signed in here",
// signed with a secret both Workers share and valid for 60 seconds. The browser
// carries it on an ordinary GET navigation — the one thing nothing blocks — and
// the portal verifies the signature itself. The code is opaque and expires
// almost immediately, so it's safe in a URL.

const enc = new TextEncoder();

function b64url(bytes: ArrayBuffer | Uint8Array): string {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let s = "";
  for (const x of b) s += String.fromCharCode(x);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromB64url(s: string): Uint8Array {
  const p = s.replace(/-/g, "+").replace(/_/g, "/").padEnd(s.length + ((4 - (s.length % 4)) % 4), "=");
  const bin = atob(p);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function key(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, [
    "sign",
    "verify",
  ]);
}

/** Mint a code for `email`, valid for `ttlSeconds`. */
export async function signSsoCode(
  email: string,
  secret: string,
  ttlSeconds = 60,
): Promise<string> {
  const payload = b64url(
    enc.encode(JSON.stringify({ email, exp: Math.floor(Date.now() / 1000) + ttlSeconds })),
  );
  const sig = await crypto.subtle.sign("HMAC", await key(secret), enc.encode(payload));
  return `${payload}.${b64url(sig)}`;
}

/** Verify a code. Returns the email, or null if invalid/expired. */
export async function verifySsoCode(code: string, secret: string): Promise<string | null> {
  try {
    const [payload, sig] = code.split(".");
    if (!payload || !sig) return null;
    const ok = await crypto.subtle.verify(
      "HMAC",
      await key(secret),
      fromB64url(sig) as BufferSource,
      enc.encode(payload),
    );
    if (!ok) return null;
    const data = JSON.parse(new TextDecoder().decode(fromB64url(payload))) as {
      email?: string;
      exp?: number;
    };
    if (!data.email || !data.exp) return null;
    if (data.exp < Math.floor(Date.now() / 1000)) return null;
    return data.email.toLowerCase();
  } catch {
    return null;
  }
}
