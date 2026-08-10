// Regression tests for the route-level authorization guards.
//
// Each of these decisions was, or protects against, a real hole found this
// session: the IT help-desk reset that could take over a Super_Admin, the push
// endpoint that could be re-pointed at someone else, the message attachment
// that stayed readable after a member was removed. The guards now live as pure
// functions (lib/authz.ts) so they can be pinned here — a change that reopens
// any of them turns this suite red instead of shipping.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  PRIVILEGED_ROLES,
  isPrivilegedRole,
  canResetPasswordFor,
  canNotifyAnyone,
  mayClaimPushEndpoint,
  isChannelScopedFileKey,
} from "../lib/authz.ts";

describe("password reset target guard", () => {
  // The exact takeover that was live for a day: an IT_Admin minting a recovery
  // link for a Super_Admin, and (email unconfigured) getting it back to use.
  test("IT_Admin cannot reset a Super_Admin", () => {
    assert.equal(canResetPasswordFor("IT_Admin", "Super_Admin"), false);
  });

  test("IT_Admin cannot reset an Admin (Apostle/Pastor) or another IT_Admin", () => {
    assert.equal(canResetPasswordFor("IT_Admin", "Admin"), false);
    assert.equal(canResetPasswordFor("IT_Admin", "IT_Admin"), false);
  });

  test("IT_Admin CAN reset an ordinary member/volunteer/staff — the actual help-desk job", () => {
    assert.equal(canResetPasswordFor("IT_Admin", "Member"), true);
    assert.equal(canResetPasswordFor("IT_Admin", "Volunteer"), true);
    assert.equal(canResetPasswordFor("IT_Admin", "Staff"), true);
  });

  test("a Super_Admin may reset anyone, including privileged accounts", () => {
    for (const target of ["Super_Admin", "Admin", "IT_Admin", "Staff", "Member"]) {
      assert.equal(canResetPasswordFor("Super_Admin", target), true, `target ${target}`);
    }
  });

  test("a non-Super_Admin caller is capped even against unknown/null target roles it can't classify", () => {
    // A null target role is unprivileged → resettable; an unknown string is
    // treated as unprivileged too (fail-open only for NON-privileged, which is
    // safe: the privileged set is an explicit allowlist of who to protect).
    assert.equal(canResetPasswordFor("IT_Admin", null), true);
    assert.equal(canResetPasswordFor("IT_Admin", "SomeFutureRole"), true);
  });

  test("every privileged rung is protected from non-Super_Admin resets", () => {
    for (const target of PRIVILEGED_ROLES) {
      assert.equal(canResetPasswordFor("IT_Admin", target), false, `target ${target}`);
      assert.equal(canResetPasswordFor("Staff", target), false, `target ${target}`);
    }
  });
});

describe("privileged-role classification", () => {
  test("Super_Admin, Admin, IT_Admin are privileged; the rest are not", () => {
    assert.equal(isPrivilegedRole("Super_Admin"), true);
    assert.equal(isPrivilegedRole("Admin"), true);
    assert.equal(isPrivilegedRole("IT_Admin"), true);
    assert.equal(isPrivilegedRole("Staff"), false);
    assert.equal(isPrivilegedRole("Volunteer"), false);
    assert.equal(isPrivilegedRole("Member"), false);
    assert.equal(isPrivilegedRole(null), false);
    assert.equal(isPrivilegedRole(undefined), false);
  });
});

describe("broadcast-notify role gate", () => {
  test("leadership/IT/staff may notify anyone; members and volunteers may not", () => {
    assert.equal(canNotifyAnyone("Super_Admin"), true);
    assert.equal(canNotifyAnyone("Admin"), true);
    assert.equal(canNotifyAnyone("IT_Admin"), true);
    assert.equal(canNotifyAnyone("Staff"), true);
    assert.equal(canNotifyAnyone("Volunteer"), false);
    assert.equal(canNotifyAnyone("Member"), false);
    assert.equal(canNotifyAnyone(null), false);
  });
});

describe("push endpoint claim ownership", () => {
  test("an unclaimed endpoint may be taken (first registration / own rotation)", () => {
    assert.equal(mayClaimPushEndpoint(null, "me"), true);
    assert.equal(mayClaimPushEndpoint(undefined, "me"), true);
  });

  test("your own endpoint may be re-claimed", () => {
    assert.equal(mayClaimPushEndpoint("me", "me"), true);
  });

  test("someone else's endpoint may NOT be claimed — the hijack that was fixed", () => {
    assert.equal(mayClaimPushEndpoint("victim", "attacker"), false);
  });

  test("a missing caller profile can claim nothing", () => {
    assert.equal(mayClaimPushEndpoint(null, ""), false);
    assert.equal(mayClaimPushEndpoint("victim", ""), false);
  });
});

describe("channel-scoped file gate", () => {
  test("message attachments are gated; profile photos are not", () => {
    assert.equal(isChannelScopedFileKey("messages/abc-123/photo.jpg"), true);
    assert.equal(isChannelScopedFileKey("profiles/abc-123/avatar.png"), false);
    assert.equal(isChannelScopedFileKey("attachments/x.pdf"), false);
    assert.equal(isChannelScopedFileKey("random-key"), false);
  });
});
