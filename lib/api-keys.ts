// Personal API keys for agents acting on someone's behalf.
//
// Pure helpers — no database, no framework — so the key format and hashing are
// unit-tested (tests/api-keys.test.mjs) and shared by every route that creates,
// revokes or exchanges a key. See docs/agent-access.md for how a key is used.

/**
 * Every key starts with this. A key pasted somewhere it should not be is then
 * recognisable at a glance — by a person, or by a secret scanner.
 */
export const API_KEY_PREFIX = "ahk_";

/** 256 bits: unguessable, which is what lets a fast hash protect it at rest. */
const BODY_BYTES = 32;

/** "ahk_" + 43 base64url characters (32 bytes, padding stripped). */
const KEY_PATTERN = /^ahk_[A-Za-z0-9_-]{43}$/;

/**
 * Lifetimes offered when creating a key. There is no "never": a key that
 * outlives the reason it was made is how an old credential ends up being the
 * one that leaks.
 */
export const EXPIRY_DAYS = [30, 90, 180, 365] as const;
export type ExpiryDays = (typeof EXPIRY_DAYS)[number];
export const DEFAULT_EXPIRY_DAYS: ExpiryDays = 90;

function b64url(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** A new key. The plaintext exists only in the response that shows it once. */
export function generateApiKey(): string {
  const bytes = new Uint8Array(BODY_BYTES);
  crypto.getRandomValues(bytes);
  return API_KEY_PREFIX + b64url(bytes);
}

/** Is this shaped like one of our keys (as opposed to a session token)? */
export function isApiKey(value: string): boolean {
  return KEY_PATTERN.test(value);
}

/** The part shown on the admin page: enough to recognise, useless to sign in with. */
export function keyPrefix(key: string): string {
  return key.slice(0, 12);
}

/** SHA-256, hex. What is stored and what an incoming key is looked up by. */
export async function hashApiKey(key: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(key));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** The credential in an `Authorization: Bearer …` header, or null. */
export function bearerToken(header: string | null | undefined): string | null {
  if (!header) return null;
  const m = header.match(/^Bearer\s+(\S+)\s*$/i);
  return m ? m[1] : null;
}

/** ISO expiry for one of the offered lifetimes. Anything else is refused. */
export function expiryFromDays(days: number, now: number = Date.now()): string {
  if (!(EXPIRY_DAYS as readonly number[]).includes(days)) {
    throw new Error(`expiry must be one of ${EXPIRY_DAYS.join(", ")} days`);
  }
  return new Date(now + days * 86_400_000).toISOString();
}

/** Usable right now: not revoked, and not past its expiry. */
export function keyIsLive(
  row: { revoked_at: string | null; expires_at: string | null },
  now: number = Date.now(),
): boolean {
  if (row.revoked_at) return false;
  if (row.expires_at && new Date(row.expires_at).getTime() <= now) return false;
  return true;
}
