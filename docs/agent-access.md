# Agent access to AriseHub and the IT portal

For an automated agent acting on behalf of one person. The agent can do what
that person can do — in both apps — and nothing more.

## 1. Get a session

The owner creates a key at **Admin → API keys** (Super_Admin only) and gives
it to the agent through its secret configuration. Never paste a key into a
chat, a log, a ticket or a commit.

```
POST https://arisehub.myfaithtech.com/api/agent/token
Authorization: Bearer ahk_…
```

```json
{
  "access_token": "eyJ…",
  "token_type": "bearer",
  "expires_in": 3600,
  "expires_at": 1789999999,
  "user": { "profile_id": "…", "name": "…", "role": "Super_Admin", "email": "…" },
  "endpoints": {
    "arisehub": "https://arisehub.myfaithtech.com",
    "supabase_url": "https://luzmqpfsylpqxbwzyjcz.supabase.co",
    "supabase_publishable_key": "sb_publishable_…",
    "it_portal": "https://itportal.myfaithtech.com"
  }
}
```

The session lasts **one hour**. There is no refresh token: when a call returns
`401`, exchange the key again. A `401 invalid_api_key` from this endpoint means
the key was revoked, expired, or its owner can no longer sign in — stop and
tell the owner rather than retrying.

## 2. Use it

Send the **access token** (not the key) as a bearer token.

| Where | How |
| --- | --- |
| AriseHub API routes | `https://arisehub.myfaithtech.com/api/…` with `Authorization: Bearer <access_token>` |
| AriseHub data (people, schedule, plans, tasks, messages — everything the app screens read and write) | Supabase REST or `@supabase/supabase-js` at `supabase_url`, with headers `apikey: <supabase_publishable_key>` and `Authorization: Bearer <access_token>` |
| IT portal API | `https://itportal.myfaithtech.com/api/…` with `Authorization: Bearer <access_token>` |

Much of AriseHub writes straight to the database from its screens rather than
through `/api` routes, so the Supabase REST path is the one that covers
"anything the owner can do". Every request is checked by the same row-level
security policies as the owner in a browser. In the IT portal, the owner's
portal role (by email) applies.

```js
import { createClient } from "@supabase/supabase-js";

const t = await (await fetch(`${HUB}/api/agent/token`, {
  method: "POST",
  headers: { Authorization: `Bearer ${process.env.ARISEHUB_API_KEY}` },
})).json();

const db = createClient(t.endpoints.supabase_url, t.endpoints.supabase_publishable_key, {
  global: { headers: { Authorization: `Bearer ${t.access_token}` } },
  auth: { persistSession: false, autoRefreshToken: false },
});

const { data: plans } = await db.from("service_plans").select("id, title, service_date");
```

## 3. What a key cannot do

- **Manage API keys.** Creating and revoking keys refuses any request with an
  `Authorization` header, so a leaked key cannot mint a replacement or undo
  its own revocation.
- **Change code or deploy.** Those are GitHub and Cloudflare, not AriseHub. An
  agent that should push code needs its own GitHub fine-grained token for
  `Rehchu/AriseHub`; one that should deploy needs a Cloudflare API token. The
  owner creates those in GitHub and Cloudflare directly.

### In the IT portal, four more

The portal applies the owner's role, so a Super_Admin's agent would otherwise
be able to read out every stored WiFi password. Four things are refused with a
`403` there, whatever the owner's role — do them signed in to the portal in a
browser:

| Refused | Why |
| --- | --- |
| `GET /api/wifi/:id/reveal` | The password is encrypted at rest so it is not casually readable, and every reveal is logged against a person. An agent cannot be that person. |
| `POST /api/access-passes`, `/:id/rotate`, `DELETE /:id` | A pass with `scope: "wifi"` hands its holder the decrypted password through the guest flow, so issuing one is the same disclosure as a reveal. Listing passes is fine. |
| `POST /api/users/:id/reset-password`, `/unlock`, `/api/auth/change-password`, and any write to `/api/users` | How a person gains or loses access. Reading the directory is fine. |
| Anything under `/api/api-keys` | The same rule AriseHub already applies to its own keys. |

The portal tells an agent from a person by the credential: every browser path
into it ends in a `church_session` cookie, so a bearer token on a protected
route is not a browser. Nothing is stamped into the access token, and the
portal never calls back to AriseHub to ask.

Everything else — requests, assets, consumables, licenses, the dashboard — the
agent does at the owner's role. Each write it makes is recorded in the portal's
audit log as `agent_request`, and each refusal as `agent_refused`.

## 4. Revocation and audit

- Revoking at **Admin → API keys** blocks new exchanges immediately. A session
  already issued keeps working until it expires — at most one hour — because
  an access token is a signed JWT that cannot be recalled.
- Key creation and revocation are written to `chms_audit_log`. Each exchange
  updates the key's "last used" time and IP.
- Changes the agent makes are attributed to the owner, exactly as if they had
  made them.
