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

## 4. Revocation and audit

- Revoking at **Admin → API keys** blocks new exchanges immediately. A session
  already issued keeps working until it expires — at most one hour — because
  an access token is a signed JWT that cannot be recalled.
- Key creation and revocation are written to `chms_audit_log`. Each exchange
  updates the key's "last used" time and IP.
- Changes the agent makes are attributed to the owner, exactly as if they had
  made them.
