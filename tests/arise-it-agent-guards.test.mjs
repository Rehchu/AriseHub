// Regression tests for what an agent may never do in the Arise IT portal.
//
// An `ahk_` key trades at POST /api/agent/token for a one-hour Supabase session
// belonging to its owner, and the IT portal already accepts those tokens — so
// an agent arrives there with the owner's full portal role and no portal change
// at all. At super_admin, "anything the owner can do" includes reading out
// every stored WiFi password, so four doors are shut on it: revealing a stored
// credential, ISSUING one (a wifi-scoped guest pass hands its holder the same
// password), account recovery and user management, and key management.
//
// The portal knows a request is automated because every browser path ends in a
// church_session cookie, so a bearer token on a protected route is by
// construction not a browser. See lib/agent-guards.ts.
//
// Those rules live as a pure function (worker/src/lib/agent-guards.ts) so they
// can be pinned here: a change that reopens any of them turns this suite red
// instead of shipping.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { agentBlock } from "../arise-it-portal/worker/src/lib/agent-guards.ts";

const blocked = (method, path) => agentBlock(method, path) !== null;

describe("stored credentials stay shut to an agent", () => {
  test("the WiFi reveal is refused", () => {
    assert.equal(blocked("GET", "/api/wifi/7/reveal"), true);
  });

  test("…whatever the id looks like", () => {
    assert.equal(blocked("GET", "/api/wifi/abc-123/reveal"), true);
  });

  test("…with a trailing slash", () => {
    assert.equal(blocked("GET", "/api/wifi/7/reveal/"), true);
  });

  test("…in a different case", () => {
    assert.equal(blocked("GET", "/API/WIFI/7/REVEAL"), true);
  });

  test("but listing networks, which are masked, is ordinary work", () => {
    assert.equal(blocked("GET", "/api/wifi"), false);
    assert.equal(blocked("GET", "/api/wifi?campusId=2"), false);
  });

  test("and creating or editing a network is ordinary work", () => {
    assert.equal(blocked("POST", "/api/wifi"), false);
    assert.equal(blocked("PUT", "/api/wifi/7"), false);
  });
});

describe("and cannot be read the long way round", () => {
  // The hole this closes: a wifi-scoped guest pass hands its holder the
  // decrypted password via /api/guest/wifi. An agent that could mint one would
  // simply read the password the long way, and the reveal block above would be
  // decoration. Found by asking "what else reaches decryptSecret?".
  test("minting a guest access pass is refused", () => {
    assert.equal(blocked("POST", "/api/access-passes"), true);
  });

  test("rotating a pass code is refused", () => {
    assert.equal(blocked("POST", "/api/access-passes/3/rotate"), true);
  });

  test("deleting a pass is refused", () => {
    assert.equal(blocked("DELETE", "/api/access-passes/3"), true);
  });

  test("but listing passes is allowed — knowing they exist discloses nothing", () => {
    assert.equal(blocked("GET", "/api/access-passes"), false);
  });
});

describe("accounts are a person's decision", () => {
  test("a password reset is refused", () => {
    assert.equal(blocked("POST", "/api/users/4/reset-password"), true);
  });

  test("an unlock is refused", () => {
    assert.equal(blocked("POST", "/api/users/4/unlock"), true);
  });

  test("changing a password is refused", () => {
    assert.equal(blocked("POST", "/api/auth/change-password"), true);
  });

  test("creating, editing or deactivating a user is refused", () => {
    assert.equal(blocked("POST", "/api/users"), true);
    assert.equal(blocked("PUT", "/api/users/4"), true);
    assert.equal(blocked("DELETE", "/api/users/4"), true);
  });

  test("but reading the directory is allowed — an agent needs to know who people are", () => {
    assert.equal(blocked("GET", "/api/users"), false);
    assert.equal(blocked("GET", "/api/users/4"), false);
  });
});

describe("an agent cannot manage keys", () => {
  test("listing, minting and revoking are all refused", () => {
    assert.equal(blocked("GET", "/api/api-keys"), true);
    assert.equal(blocked("POST", "/api/api-keys"), true);
    assert.equal(blocked("POST", "/api/api-keys/3/revoke"), true);
  });

  test("…including the revoke-all shortcut", () => {
    assert.equal(blocked("POST", "/api/api-keys/revoke-all/4"), true);
  });
});

describe("the rest of the portal is the job", () => {
  for (const [method, path] of [
    ["GET", "/api/dashboard"],
    ["GET", "/api/tickets"],
    ["POST", "/api/tickets"],
    ["POST", "/api/tickets/9/comments"],
    ["GET", "/api/assets"],
    ["POST", "/api/assets/3/checkout"],
    ["POST", "/api/assets/3/checkin"],
    ["GET", "/api/consumables"],
    ["POST", "/api/consumables/2/adjust"],
    ["GET", "/api/licenses"],
    ["GET", "/api/audit-log"],
    ["GET", "/api/campuses"],
    ["GET", "/api/locations"],
  ]) {
    test(`${method} ${path}`, () => {
      assert.equal(blocked(method, path), false);
    });
  }
});

describe("the refusal says what it is", () => {
  test("each block carries a 403 and a reason", () => {
    for (const [method, path] of [
      ["GET", "/api/wifi/7/reveal"],
      ["POST", "/api/users/4/reset-password"],
      ["POST", "/api/api-keys"],
    ]) {
      const block = agentBlock(method, path);
      assert.equal(block.status, 403);
      assert.ok(block.error.length > 10, "a refusal should explain itself");
    }
  });
});
