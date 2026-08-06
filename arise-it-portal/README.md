# Arise IT Portal

A self-hosted asset/equipment tracker, IT request/ticketing system, WiFi credential vault, consumables & software license tracker, and user portal for Arise Church's multiple campuses — built entirely on Cloudflare and deployed as a **single Worker** (no separate Pages project), installable as a PWA on phone and desktop. Inspired by Snipe-IT (checkout/checkin, asset tags), GLPI (campus/location hierarchy, license tracking), SAMS (simple UI), and InvGate Service Management (the Requests dashboard, colored stat tiles, priority-card layout) — but implemented natively for Cloudflare's serverless stack rather than any of their original codebases.

**Live**: https://arise-it.dyer-hq.workers.dev

Branding (colors, fonts) was pulled directly from [arisecenla.church](https://www.arisecenla.church/): a deep crimson red (`#D2303B`, sampled from the church logo) on near-black chrome, Poppins for headings, Inter for body text. See `frontend/tailwind.config.js` for the palette — change the `brand`/`ink`/`gold` scales there if the church's branding changes.

## What's included

- **Requests (IT Ticketing)**: staff submit requests (subject, description, category, priority, due date); you triage from a dashboard styled after InvGate — stat tiles for Waiting for Me / Assigned to Me / Unassigned / Due Soon, priority-colored ticket cards with overdue badges, status/priority/assignee controls, and a comment thread per ticket.
- **Assets/Equipment**: full CRUD, campus + location + category + status filters, search, checkout/checkin to a person or room, full history timeline, maintenance/repair log with cost + next-due-date, auto-generated asset tags with printable QR labels, photo upload (stored in R2), CSV import and export.
- **Consumables**: track cables/batteries/adapters etc. — quantity on hand, reorder threshold, per-campus, with a low-stock dashboard alert and quick +/- adjustment buttons.
- **Software Licenses**: name, vendor, seat count, renewal date, cost; assign/unassign seats to specific staff, with a renewal-expiring-soon dashboard alert.
- **WiFi Vault**: per-campus WiFi credentials, AES-256-GCM encrypted at rest, masked by default, reveal/copy actions are audit-logged.
- **User portal**: login/logout, forced password change on first login, self-service password change, admin-managed users with roles (`super_admin`, `campus_admin`, `viewer`), campus-scoped access for campus admins.
- **Dashboard**: ticket stat tiles, recent requests, asset totals by status/category/campus, warranty-expiring, maintenance-due, low-stock, and license-renewal alerts.
- **Global search**: one search bar (header) across assets and requests.
- **Dark mode**: toggle in the header, persisted per device.
- **Installable PWA**: "Add to Home Screen" / desktop install support (manifest + service worker), works offline for the app shell.
- **No-account access** — two ways for people to use the portal without ever creating an account:
  - **Public request form** at `/request` — anyone (department heads, volunteers) submits an IT request with just their name + campus + issue. It lands in your Requests queue instantly, tagged with a "Guest" badge. Spam-protected (honeypot + per-IP rate limit). Share the link or print it as a QR poster in each office.
  - **Quick Access codes** at `/go` — you create short codes (e.g. `AB7-K2M-4QX`) from the **Quick Access** admin page, each scoped to either *equipment* or *WiFi* for one campus. Someone enters the code once and gets a read-only view for 30 days on that device:
    - *Equipment* scope → a read-only board of that campus's gear with each item's **last maintenance** (e.g. "Batteries changed — Jun 12", "X32 firmware updated — May 30"). Built for the Praise Team Leader.
    - *WiFi* scope → that campus's WiFi networks with passwords (tap to copy), including multiple networks per location. Built for the Leadership team.
    - Codes are revocable instantly, and every WiFi view / code unlock is audit-logged with the pass's label. A Quick Access cookie can **only** see its scoped board — it has zero access to the admin app.
- **Auto-generated PDF posters** — the print system, so handing out access is a complete loop:
  - When you create (or reprint) an access code, click **Download Poster (PDF)** — a branded, print-ready poster with the flame logo, a big QR to `/go`, the code in large type, and step-by-step instructions. Print it, post it.
  - **New code / Reprint** on any pass generates a fresh code (the old one stops working) — use it if a poster is lost, since codes are only shown once.
  - **Request Form Poster (PDF)** — a "Need IT Help? Scan to submit a request" poster (QR to `/request`) to print for offices and green rooms.
  - **Print Labels (PDF)** on the Assets page — a multi-up QR label sheet for the currently-filtered assets, so you can tag lots of gear at once (each label's QR opens that asset).
- **Custom Arise IT logo** — the church's flame+A mark recreated as clean vector, used across the app, the installable PWA icon, and every PDF poster. Defined in `frontend/src/components/Logo.tsx` (and `frontend/scripts/generate-icons.mjs` for the PWA icons).

### Share links (print these as QR posters)
- Report a problem: **https://arise-it.dyer-hq.workers.dev/request**
- Enter an access code: **https://arise-it.dyer-hq.workers.dev/go**

(Both also have one-click **PDF posters** from the Quick Access admin page — no need to make your own.)
- **Audit log**: every create/update/delete/checkout/checkin/reveal/ticket/license/consumable action, who did it and when.
- **Categories & Models**: reusable brand/model templates so adding 10 identical mic stands is fast.

## Stack

- `worker/` — Cloudflare Worker: Hono API (Drizzle ORM + D1 + R2) **and** serves the built frontend as static assets via Wrangler's `[assets]` config (Wrangler v4+) — one Worker, one deploy, no Cloudflare Pages project needed.
- `frontend/` — React + Vite + Tailwind + `vite-plugin-pwa`. `npm run build` outputs to `frontend/dist`, which the Worker serves directly.

Routing: `worker/wrangler.toml`'s `[assets]` block sets `run_worker_first = ["/api/*"]`, so `/api/*` requests always hit the Hono API while everything else is served as a static file (with `not_found_handling = "single-page-application"` so client-side routes like `/assets/5` still resolve to `index.html` on a hard refresh).

## First-time setup

### 1. Install dependencies

```
cd worker && npm install
cd ../frontend && npm install
```

### 2. Create your Cloudflare D1 database and R2 bucket

```
cd worker
npx wrangler d1 create arise_it_portal
```

Copy the returned `database_id` into `worker/wrangler.toml`.

```
npx wrangler r2 bucket create arise-it-portal-files
```

### 3. Set secrets

```
npx wrangler secret put JWT_SECRET
# any long random string, e.g. output of: openssl rand -base64 48

npx wrangler secret put WIFI_ENCRYPTION_KEY
# exactly 32 random bytes, base64-encoded, e.g.: openssl rand -base64 32

npx wrangler secret put RESEND_API_KEY
# optional — enables email invites. Get a key at resend.com. If you skip this,
# user creation still works; you just share the temp password manually.
```

Email invites: when set, creating a user (or resetting a password) sends a
branded email with a temp password + Sign in link via [Resend](https://resend.com).
The sender is `FROM_EMAIL` in `worker/wrangler.toml` — it must be on a domain
**verified in your Resend account** to reach arbitrary recipients (currently
`noreply@myfaithtech.com`, which is verified). To send from an
`@arisecenla.church` address instead, verify that domain (or a subdomain) in
Resend and update `FROM_EMAIL`. Delivery is fail-soft: if Resend errors or the
key is unset, the UI just shows the temp password to share manually.

For **local development**, instead create `worker/.dev.vars` (already gitignored):

```
JWT_SECRET=some-long-random-local-only-string
WIFI_ENCRYPTION_KEY=<base64 32 bytes>
RESEND_API_KEY=<your key>   # optional, for testing email locally
```

### 4. Run migrations

```
npm run db:migrate:local     # for local dev (wrangler dev)
npm run db:migrate:remote    # for your real Cloudflare D1 database
```

### 5. Create your first super-admin login

```
node scripts/make-admin-seed.mjs "Your Name" "you@example.com" "YourStrongPassword" "Main Campus"
npm run seed:local     # or seed:remote
```

This prints the login you just created and writes `worker/seed.sql` (gitignored — don't commit real credentials).

### 6. Run locally

Two options:

- **Fastest iteration** (hot-reloading frontend): run both dev servers — `cd worker && npm run dev` (http://localhost:8787, the API) and `cd frontend && npm run dev` (http://localhost:5173, the UI with HMR). `frontend/.env.development` already points the UI at `http://localhost:8787` for you in this mode.
- **Closest to production** (single origin, matches what actually deploys, and the only way to test PWA installability/service worker locally): run `npm run build` once from the repo root (builds the frontend into `frontend/dist`), then `cd worker && npm run dev` and open **http://localhost:8787** for everything — no second dev server.

Log in with the email/password from step 5. You'll land on the Dashboard; use **Categories & Models** and **Campuses & Locations** first to set up your data, then start adding assets.

## Deploying to Cloudflare

Since you already have Cloudflare Workers running on this account, this is just another Worker (`arise-it`) — no new product/plan needed, and no separate Pages project to manage.

```
npm run deploy
```

(from the repo root — this runs `vite build` then `wrangler deploy` for you, per the root `package.json`). Whenever the Drizzle schema changes, also run `npm run db:migrate:remote` before deploying.

No `ALLOWED_ORIGINS`/CORS configuration is needed for production since the frontend and API share one origin; that setting only matters for the local two-dev-server workflow above.

**Custom domain**: not set up yet — the church's domain (arisecenla.church) is on Wix and the user doesn't currently have DNS access. The `workers.dev` URL is fine to use long-term for an internal tool; when DNS access is available, attach a Custom Domain (e.g. `it.arisecenla.church`) to the `arise-it` Worker in the Cloudflare dashboard, or delegate just that subdomain via an NS record without touching the rest of the Wix-hosted site.

## Day-to-day usage notes

- **Adding a new user**: Users page → Create User. A temporary password is shown once — share it securely (in person, or your password manager). The user must set a new password on first login.
- **WiFi passwords**: never displayed by default. Clicking "Reveal" decrypts on demand and logs who revealed it, when, and from what IP — check the Audit Log if you ever need to know who saw a network's password.
- **Asset tags**: auto-assigned as `CHURCH-0001`, `CHURCH-0002`, etc. Each asset's detail page has a QR code you can print and stick on the device — scanning it opens that asset's page directly. You can also snap a photo of the asset from the same page.
- **Bulk-adding assets**: use the CSV import button on the Assets page — same column layout as the CSV export, so exporting then re-importing (with edits) works too.
- **Installing as an app**: visit the site on your phone or desktop browser and use "Add to Home Screen" (mobile) or the install icon in the address bar (desktop Chrome/Edge).
- **Campus admins** only see/manage data for their assigned campus; **super_admin** sees everything and manages users.

## Not built (possible future additions)

Email/SMS notifications for the various dashboard alerts (warranty, maintenance, low stock, license renewal) were intentionally left out to keep things focused — everything currently surfaces on the in-app Dashboard instead of pushing notifications externally.
