# AriseHub ↔ IT portal

Two Cloudflare Workers, two databases. AriseHub is Next.js on Supabase;
`itportal.myfaithtech.com` (the `arise-it` Worker) is Hono on D1. They share
exactly one thing: `SSO_SHARED_SECRET`, an HMAC secret set on both.

## What already works

| Direction | Endpoint | Purpose |
| --- | --- | --- |
| Hub → portal | `GET /api/auth/sso-code?c=<code>` | Sign-in hand-off. Verifies the code, starts a portal session. |
| Hub → portal | `POST /api/public/tickets` | Raise a ticket. Used by "Get IT Help" and by "Make a ticket" in a support thread. |

The code is minted by `lib/sso-code.ts`: an HMAC-SHA256 over
`base64url({ email, exp })`, valid 60 seconds, formatted `payload.signature`.
It asserts one thing — *this email is authenticated on AriseHub* — and nothing
about what they may do. The portal decides that.

## What is still needed, and why it has to live in the portal

Both remaining pieces are **in the `arise-it` repo, not this one.** A ticket's
status changes in the portal's own D1 database; AriseHub never learns it
happened. There is no webhook, no shared table, no polling. So neither piece can
be built from this side.

### 1. Read a person's tickets — `GET /api/public/my-tickets?c=<code>`

The AriseHub half is **already built and deployed**:
`app/api/it/my-tickets/route.ts` mints the code and calls this URL;
`components/it/MyTickets.tsx` renders the card on the dashboard. It treats 404
as "not built yet" and renders nothing, so shipping the portal side is the only
remaining step — no AriseHub change, no redeploy.

Contract:

```
GET /api/public/my-tickets?c=<sso code>

200 → { "tickets": [
          { "id": "…",
            "subject": "…",
            "status": "open" | "in progress" | "waiting" | "resolved" | …,
            "priority": "normal",            // optional
            "updated_at": "2026-08-08T22:00:00Z",  // optional, ISO
            "url": "https://itportal…/requests/123"  // optional
          } ] }

401 → invalid or expired code
```

Verify the code with the same secret and the same algorithm — `verifySsoCode` in
`lib/sso-code.ts` is the reference implementation and can be copied verbatim.
Return only tickets whose requester email matches the email inside the code.
**Never accept an email as a query parameter**: that would let anyone read
anyone's tickets by guessing an address.

Order newest-first and cap at ~20; the card shows five and counts the rest.

### 2. Status-change emails from AriseIT

When a ticket's status changes, email the requester from
`AriseIT <ariseit@myfaithtech.com>` via Resend.

This belongs in the portal because that is where the change happens. AriseHub
has the sender split ready (`SENDERS.it` and `IT_RESEND_API_KEY` in
`lib/email.ts`) if any ticket mail ever does originate here, but routine status
mail should not make a round trip through a second app to be sent.

Notes worth carrying over from this side:

- **Two senders, deliberately.** Anything about someone's *account* — password
  reset, invitation — is AriseHub. Anything about a *ticket* is AriseIT, so a
  status change lands in the same conversation as the rest of their IT history
  rather than looking like a login email.
- **Separate Resend keys**, so either can be rotated or revoked without
  silencing the other.
- **Do not email on every write.** Only on a genuine status transition, and not
  when the person making the change is the requester themselves — they know.
- **A failed email must never fail the status change.** `lib/email.ts` never
  throws; it returns `{ ok, error }`. Same discipline there.

## The one thing to be careful about

The SSO code is a bearer credential for 60 seconds. It is safe in a URL because
of that short life — but it must never be logged, and the portal should reject a
code whose `exp` has passed rather than allowing clock slack. `verifySsoCode`
already does both.
