/**
 * What an automated caller may never do in the IT portal.
 *
 * AriseHub mints agent sessions (`POST /api/agent/token` trades an `ahk_` key
 * for a one-hour Supabase session belonging to the key's owner), and this
 * portal already accepts those tokens — `requireAuth` verifies them against the
 * project JWKS and maps them to a local user by email. So an agent arrives here
 * with its owner's full portal role and no portal change at all. That is the
 * point of the design, and it is also why these four doors need shutting: at
 * super_admin, "anything the owner can do" includes reading out every stored
 * WiFi password.
 *
 * HOW WE KNOW IT IS AUTOMATED. Every browser path into this portal ends in a
 * `church_session` cookie — /api/auth/login and all three SSO routes call
 * setCookie, and the SPA sends `credentials: "include"` with no Authorization
 * header (the single Bearer it ever sends is the hand-off to /api/auth/sso,
 * which is a login route and not behind requireAuth). So a Supabase bearer on a
 * PROTECTED route is, by construction, not a browser. That is the marker: no
 * custom JWT claim to mint, no cross-database lookup, no per-request hop to
 * AriseHub.
 *
 * It follows the same reasoning AriseHub's own lib/api-key-guards.ts uses for
 * key management — "needs a person at the keyboard; any Authorization header is
 * refused" — applied to the portal's four equivalents:
 *
 *  1. REVEAL A STORED CREDENTIAL. `/api/wifi/:id/reveal` decrypts a password
 *     kept encrypted at rest precisely so it is not casually readable, and
 *     every reveal is logged against a person. An agent cannot be that person.
 *  2. ISSUE ONE. A guest access pass with `scope: "wifi"` hands its holder the
 *     decrypted password through `/api/guest/wifi` (routes/guest.ts runs
 *     decryptSecret for any pass-bearing visitor). An agent that could mint a
 *     pass would read the password the long way round, and rule 1 would be
 *     decoration. Reading the list of passes discloses nothing and is allowed.
 *  3. CHANGE SOMEONE'S ACCOUNT. Resets, unlocks, and creating, editing or
 *     deactivating users are how a person gains or loses access. Reading the
 *     directory is fine.
 *  4. MANAGE API KEYS. Mirrors AriseHub's own rule, so neither app lets a key
 *     mint a replacement or undo its own revocation.
 *
 * If a human ever needs one of these from a script, they do it in the browser —
 * the same answer AriseHub already gives for key management.
 *
 * A pure function, like lib/authz.ts, so the suite can pin it: a change that
 * reopens any of these turns the tests red instead of shipping. It takes the
 * method and path and nothing else — nothing to mock, nothing to drift.
 */

export interface AgentBlock {
  status: 403;
  error: string;
}

/** The reveal route, under any mount prefix, with or without a trailing slash. */
const REVEAL = /\/wifi\/[^/]+\/reveal\/?$/i;
/** Password resets, unlocks and changes, wherever they hang. */
const ACCOUNT_RECOVERY = /\/(?:reset-password|unlock|change-password)\/?$/i;
/** The users collection: reads are fine, writes are not. */
const USERS = /\/api\/users(?:\/|$)/i;
/** Guest access passes: listing is fine, issuing is not. */
const ACCESS_PASSES = /\/api\/access-passes(?:\/|$)/i;
/** Key management, in either spelling. */
const KEY_ADMIN = /\/api[-_]?keys(?:\/|$)/i;

const READ_ONLY = new Set(["GET", "HEAD", "OPTIONS"]);

const ASK_A_HUMAN = "Do it signed in to the portal in a browser.";

/**
 * The refusal for a request made by an automated caller, or null to allow it.
 *
 * `method` is the HTTP method; `path` is the request path with the query
 * already stripped (Hono's `c.req.path` is the full path even inside a mounted
 * sub-router — verified, since every rule here depends on it). Case and a
 * trailing slash are tolerated, because a gate that recognises only one
 * spelling of a path is not a gate.
 */
export function agentBlock(method: string, path: string): AgentBlock | null {
  const m = String(method || "").toUpperCase();
  const p = String(path || "");

  if (KEY_ADMIN.test(p)) {
    return { status: 403, error: `API keys cannot manage API keys. ${ASK_A_HUMAN}` };
  }
  if (REVEAL.test(p)) {
    return {
      status: 403,
      error: `Stored WiFi passwords are not available to an agent — a reveal is logged against a person, and an agent cannot be that person. ${ASK_A_HUMAN}`,
    };
  }
  if (ACCESS_PASSES.test(p) && !READ_ONLY.has(m)) {
    return {
      status: 403,
      error: `An agent can list guest access passes but not issue one — a wifi pass hands its holder the network password, which is the same disclosure a reveal is. ${ASK_A_HUMAN}`,
    };
  }
  if (ACCOUNT_RECOVERY.test(p)) {
    return { status: 403, error: `Account recovery is not available to an agent. ${ASK_A_HUMAN}` };
  }
  if (USERS.test(p) && !READ_ONLY.has(m)) {
    return { status: 403, error: `An agent can read the user directory but not change accounts. ${ASK_A_HUMAN}` };
  }
  return null;
}
