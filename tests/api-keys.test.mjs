// Personal API keys: format, hashing, expiry.
//
// A key acts with its owner's full permissions, so the helpers that decide
// what a key looks like and whether one is still usable are worth pinning
// down. Pure functions — no network, no database — so these always run.

import { test, describe } from "node:test";
import assert from "node:assert/strict";

const {
  API_KEY_PREFIX,
  EXPIRY_DAYS,
  bearerToken,
  expiryFromDays,
  generateApiKey,
  hashApiKey,
  isApiKey,
  keyIsLive,
  keyPrefix,
} = await import("../lib/api-keys.ts");

describe("generateApiKey", () => {
  test("is prefixed and shaped the way isApiKey expects", () => {
    const key = generateApiKey();
    assert.ok(key.startsWith(API_KEY_PREFIX));
    assert.equal(key.length, 4 + 43);
    assert.ok(isApiKey(key));
  });

  test("never repeats", () => {
    const keys = new Set(Array.from({ length: 500 }, generateApiKey));
    assert.equal(keys.size, 500);
  });
});

describe("isApiKey", () => {
  test("rejects a Supabase session token, so the two are never confused", () => {
    assert.equal(isApiKey("eyJhbGciOiJFUzI1NiIsInR5cCI6IkpXVCJ9.e30.sig"), false);
  });

  test("rejects near misses", () => {
    const good = generateApiKey();
    assert.equal(isApiKey(good.slice(0, -1)), false, "too short");
    assert.equal(isApiKey(good + "A"), false, "too long");
    assert.equal(isApiKey("sk_" + good.slice(4)), false, "wrong prefix");
    assert.equal(isApiKey(good.slice(0, 10) + "=" + good.slice(11)), false, "padding is stripped, never present");
  });
});

describe("keyPrefix", () => {
  test("keeps enough to recognise a key and far too little to use one", () => {
    const key = generateApiKey();
    assert.equal(keyPrefix(key).length, 12);
    assert.ok(key.startsWith(keyPrefix(key)));
    assert.equal(isApiKey(keyPrefix(key)), false);
  });
});

describe("hashApiKey", () => {
  test("is stable SHA-256 hex", async () => {
    const key = generateApiKey();
    const a = await hashApiKey(key);
    assert.match(a, /^[0-9a-f]{64}$/);
    assert.equal(a, await hashApiKey(key));
  });

  test("differs for different keys", async () => {
    assert.notEqual(await hashApiKey(generateApiKey()), await hashApiKey(generateApiKey()));
  });

  test("matches a known SHA-256 vector", async () => {
    assert.equal(
      await hashApiKey("abc"),
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });
});

describe("bearerToken", () => {
  test("reads the credential out of the header", () => {
    assert.equal(bearerToken("Bearer ahk_abc"), "ahk_abc");
    assert.equal(bearerToken("bearer   ahk_abc  "), "ahk_abc");
  });

  test("returns null for anything else", () => {
    for (const h of [null, undefined, "", "Basic dXNlcjpwYXNz", "Bearer", "Bearer a b"]) {
      assert.equal(bearerToken(h), null, `header ${JSON.stringify(h)}`);
    }
  });
});

describe("expiryFromDays", () => {
  test("adds the chosen lifetime", () => {
    const now = Date.UTC(2026, 8, 14, 12, 0, 0);
    assert.equal(expiryFromDays(90, now), new Date(now + 90 * 86_400_000).toISOString());
  });

  test("only the offered lifetimes are accepted — there is no 'never'", () => {
    for (const d of EXPIRY_DAYS) assert.doesNotThrow(() => expiryFromDays(d));
    for (const d of [0, 1, 7, 91, 3650, -30, Infinity]) {
      assert.throws(() => expiryFromDays(d), `expiry of ${d} days`);
    }
  });
});

describe("keyIsLive", () => {
  const now = Date.UTC(2026, 8, 14);
  const future = new Date(now + 86_400_000).toISOString();
  const past = new Date(now - 1).toISOString();

  test("an unrevoked key before its expiry works", () => {
    assert.equal(keyIsLive({ revoked_at: null, expires_at: future }, now), true);
  });

  test("revoked stops it, whatever the expiry says", () => {
    assert.equal(keyIsLive({ revoked_at: past, expires_at: future }, now), false);
  });

  test("expired stops it, including at the exact instant", () => {
    assert.equal(keyIsLive({ revoked_at: null, expires_at: past }, now), false);
    assert.equal(keyIsLive({ revoked_at: null, expires_at: new Date(now).toISOString() }, now), false);
  });
});
