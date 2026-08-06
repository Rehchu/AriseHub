// Verify Supabase Auth JWTs so an AriseHub session works against this API —
// one login for the whole product. Supabase signs with asymmetric keys (ES256
// by default, RS256 on some projects), so we verify against the project's
// public JWKS rather than a shared secret.

interface Jwk {
  kid?: string;
  kty: string;
  alg?: string;
  crv?: string;
  n?: string;
  e?: string;
  x?: string;
  y?: string;
}

export interface SupabasePayload {
  sub: string; // auth.users id (uuid)
  email?: string;
  exp: number;
  iss?: string;
  [key: string]: unknown;
}

// JWKS changes rarely; cache per isolate for an hour to avoid a fetch per request.
let jwksCache: { url: string; keys: Jwk[]; fetchedAt: number } | null = null;
const JWKS_TTL_MS = 60 * 60 * 1000;

function b64urlDecode(input: string): Uint8Array {
  const padded = input
    .replace(/-/g, "+")
    .replace(/_/g, "/")
    .padEnd(input.length + ((4 - (input.length % 4)) % 4), "=");
  const binary = atob(padded);
  const arr = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) arr[i] = binary.charCodeAt(i);
  return arr;
}

async function getJwks(supabaseUrl: string): Promise<Jwk[]> {
  const url = `${supabaseUrl.replace(/\/$/, "")}/auth/v1/.well-known/jwks.json`;
  if (jwksCache && jwksCache.url === url && Date.now() - jwksCache.fetchedAt < JWKS_TTL_MS) {
    return jwksCache.keys;
  }
  const res = await fetch(url);
  if (!res.ok) throw new Error(`JWKS fetch failed: ${res.status}`);
  const body = (await res.json()) as { keys: Jwk[] };
  jwksCache = { url, keys: body.keys ?? [], fetchedAt: Date.now() };
  return jwksCache.keys;
}

function algParams(
  alg: string
): {
  importAlg: { name: string; namedCurve?: string; hash?: string };
  verifyAlg: { name: string; hash?: string };
} | null {
  if (alg === "ES256") {
    return {
      importAlg: { name: "ECDSA", namedCurve: "P-256" },
      verifyAlg: { name: "ECDSA", hash: "SHA-256" },
    };
  }
  if (alg === "RS256") {
    return {
      importAlg: { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
      verifyAlg: { name: "RSASSA-PKCS1-v1_5" },
    };
  }
  return null;
}

/**
 * Verify a Supabase access token. Returns the payload, or null if the token is
 * missing/expired/untrusted. Never throws on bad input — callers treat null as
 * "not authenticated".
 */
export async function verifySupabaseJwt(
  token: string,
  supabaseUrl: string
): Promise<SupabasePayload | null> {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const [headerB64, payloadB64, sigB64] = parts;

    const header = JSON.parse(new TextDecoder().decode(b64urlDecode(headerB64))) as {
      alg: string;
      kid?: string;
    };
    const params = algParams(header.alg);
    if (!params) return null; // HS256 (legacy shared-secret) is not accepted here

    const keys = await getJwks(supabaseUrl);
    const jwk = keys.find((k) => !header.kid || k.kid === header.kid);
    if (!jwk) return null;

    const key = await crypto.subtle.importKey("jwk", jwk as JsonWebKey, params.importAlg, false, [
      "verify",
    ]);
    const valid = await crypto.subtle.verify(
      params.verifyAlg,
      key,
      b64urlDecode(sigB64),
      new TextEncoder().encode(`${headerB64}.${payloadB64}`)
    );
    if (!valid) return null;

    const payload = JSON.parse(
      new TextDecoder().decode(b64urlDecode(payloadB64))
    ) as SupabasePayload;

    // Expiry + issuer must match this project — a valid signature from another
    // Supabase project must not grant access here.
    if (!payload.exp || payload.exp < Math.floor(Date.now() / 1000)) return null;
    const expectedIss = `${supabaseUrl.replace(/\/$/, "")}/auth/v1`;
    if (payload.iss && payload.iss !== expectedIss) return null;

    return payload;
  } catch {
    return null;
  }
}
