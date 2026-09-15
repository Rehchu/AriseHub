# AriseHub — notes for Claude

Things that cost real time to work out. Read before touching CI, the IT portal,
or auth.

## Two apps, one repo

- **AriseHub** — Next.js at the repo root, Supabase (Postgres + RLS), deployed
  as the `arisehub` Worker via OpenNext.
- **Arise IT portal** — `arise-it-portal/`, Hono + Drizzle on **D1**
  (`arise_it_portal`), deployed as the `arise-it` Worker. Its own frontend
  (`arise-it-portal/frontend`, Vite + React) builds to `dist/`, which the
  worker serves as its `ASSETS`.

They are separate databases but not separate projects: the portal's launcher,
SSO and my-tickets bridge all live in AriseHub, and the portal accepts AriseHub
Supabase tokens. Don't describe the portal as a standalone app.

## CI: two deploy paths, and neither of them runs

1. **`.github/workflows/deploy.yml`** — the repo's own pipeline, `on: push:
   branches: [main]`. Builds both Workers correctly. Does **not** run on PRs.
   **GitHub Actions does not execute at all on this account** — see below.
2. **Cloudflare Workers Builds** (Git integration, configured in the dashboard,
   posts `Workers Builds: arisehub` / `Workers Builds: arise-it` checks) — a
   second path that is **misconfigured for both Workers**, in the dashboard, so
   no commit can fix it. Red checks from `cloudflare-workers-and-pages[bot]` on
   a PR are usually this, not your diff. What the build log shows, below.

So a merge to `main` ships nothing by itself. Until one of these is fixed,
deploying means running wrangler by hand (commands below).

### GitHub Actions never starts (account-wide, verified 2026-09-15)

Every Actions run across the account fails in 2–4 seconds having executed no
steps: **126 runs, 0 successes** — AriseHub 33/33 since the workflow's first
run on 2026-08-09, `Personal-dashboard-` 84/84, `ctrl-alt-pc-repair` 9/9.

The jobs are created and get check runs, then die before a runner is assigned:
`runner_id: 0`, empty `runner_name`, no `steps`, and `get_workflow_run_usage`
reports `total_ms: 0`. A job in `Personal-dashboard-` that is **pure shell with
no `uses:` at all** dies the same way, which rules out the Actions-policy
theory recorded in that repo's workflow header. Nothing in any repository can
change this; it is a GitHub account-level setting (Actions billing / spending
limit, or Actions disabled for the account).

Do not spend time debugging `deploy.yml` against a red run. Check
`get_workflow_run_usage` first: `total_ms: 0` means the workflow never ran.

### What the Workers Builds settings actually are (build log, 2026-09-15)

Read from both builds for `95eed29` — `arise-it` (id `8d62b759`) and `arisehub`
(id `61890be6`). The logs are **identical**, which is the finding: the two
Workers Builds are configured the same way, both at the repo root. A build log
is the one piece of that dashboard state that ever reaches the repo.

```
Installing project dependencies: npm clean-install
added 405 packages
Executing user build command: npm run build
> arisehub@0.1.0 build
> next build
...
Error occurred prerendering page "/login"
Error: NEXT_PUBLIC_SUPABASE_URL is not set. ...
```

Two separate faults, and the first one hides the second:

1. **The `arise-it` build is pointed at the repo root**, exactly like the
   `arisehub` one. It installs the root `package.json`, runs
   `arisehub@0.1.0 build`, and never touches `arise-it-portal/`. The portal's
   own config, build script and frontend are irrelevant to it. This is why
   `arise-it` has not deployed since 2026-08-09 no matter what lands in the
   repo — two Workers, one build, and it is AriseHub's.
2. **Build variables are not set on either Worker.** Workers Builds has a
   *Build* variables screen separate from Settings → Variables & Secrets, and a
   runtime secret cannot satisfy a prerender. Every `NEXT_PUBLIC_*` name is
   inlined at build time.

A third fault waits behind those: the root `npm run build` is `next build`,
which writes `.next/`. The `arisehub` Worker's `wrangler.jsonc` serves
`.open-next/assets`, so even with variables set, that build command deploys
nothing usable — it needs `npx opennextjs-cloudflare build`.

The fixes are all dashboard fields, per Worker, under Settings → Build:
`arise-it` needs Root directory `arise-it-portal/worker`, Build command
`npm run build`, Deploy command `npx wrangler deploy`; `arisehub` needs Build
command `npx opennextjs-cloudflare build`. Both need the `NEXT_PUBLIC_*` build
variables.

### `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` vs `ANON_KEY` (fixed 2026-09-15)

Supabase renamed the anon key to the publishable key; same value, two names.
Every Supabase client factory read only the new name while `deploy.yml`
supplied the old one, so the key came out undefined, `createClient()` threw,
and `next build` died prerendering `/login`. It compiled and typechecked
either way — only prerender failed, so a typecheck-only gate never caught it.

Both names are now accepted, in one place: **`lib/supabase/env.ts`**. Verified
on the same commit, with only `NEXT_PUBLIC_SUPABASE_ANON_KEY` set:

```
before → ✗ exit 1, Error occurred prerendering page "/login"
after  → ✓ exit 0
```

Two rules that file has to keep, both pinned in `tests/supabase-env.test.mjs`:
the key is needed at **build** time (a Worker secret does nothing for a
prerender), and each name must stay written out as a literal
`process.env.NEXT_PUBLIC_…` expression, because Next inlines those by textual
replacement — `process.env[name]` or destructuring resolves to undefined in the
browser bundle however the environment is set.

**`arise-it` used to resolve the wrong wrangler config (fixed 2026-09-15).**
Wrangler looks for `wrangler.json`, then `wrangler.jsonc`, then `wrangler.toml`,
and each name is a find-up that walks every ancestor directory before the next
name is tried. With only a `wrangler.toml` in `arise-it-portal/worker`, the
`.jsonc` search reached the repo root first, so any wrangler command run there
without `-c` operated on **AriseHub's** config. Verified on the same command:

```
before → Read 82 files from .open-next/assets   · env.MEDIA (arisehub-media), env.AI
after  → Read 19 files from ../frontend/dist    · env.DB (arise_it_portal), env.FILES
```

That is worse than a failed build. `npm run deploy` in that directory was
`… && wrangler deploy` with no `-c`, so it built the portal frontend and then
deployed the **AriseHub** Worker from whatever stale `.open-next/` was lying
around, leaving `arise-it` untouched — which is why it last deployed
2026-08-09 while `arisehub` moved at odd times.

The config is now `arise-it-portal/worker/wrangler.jsonc`. A `.jsonc` in the
directory wins the find-up, so the plain command is correct and `-c` is belt
and braces. **`tools/cron-worker/wrangler.toml` still has the identical
exposure** — a rootless wrangler run from there resolves the repo-root config.

### Building locally

```bash
# AriseHub
npm ci && npx tsc --noEmit
NEXT_PUBLIC_SUPABASE_URL=… NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=… \
  NEXT_PUBLIC_VAPID_PUBLIC_KEY=… NEXT_PUBLIC_IT_PORTAL_URL=… \
  NEXT_PUBLIC_TURNSTILE_SITE_KEY=… npx next build

# IT portal (mirrors deploy.yml's it-portal job)
cd arise-it-portal/worker   && npm ci && npx tsc --noEmit
cd arise-it-portal/frontend && npm ci && npm run build
cd arise-it-portal/worker   && npx wrangler deploy --dry-run
```

## Auth in the IT portal

`requireAuth` (`arise-it-portal/worker/src/lib/auth-middleware.ts`) takes three
identities:

1. `Authorization: Bearer <supabase jwt>` — an AriseHub session, verified
   against the project JWKS and mapped to a local `users` row **by email**.
2. The portal's own `church_session` cookie.
3. Guest access-pass cookies, handled separately.

**Every browser path ends in a cookie.** `/api/auth/login` and all three SSO
routes call `setCookie`; the SPA sends `credentials: "include"` with no
Authorization header. The only Bearer a browser sends is the hand-off to
`/api/auth/sso`, which is a login route and not behind `requireAuth`. AriseHub's
`/it-launch` mints a signed code server-side and redirects to
`/api/auth/sso-code`, which also sets the cookie.

So **a Bearer on a protected route is, by construction, not a browser** — that
is how `lib/agent-guards.ts` recognises an agent session without stamping a
claim or calling back to AriseHub. If anything ever makes a browser call a
protected route with a Supabase bearer, that assumption breaks (loudly: a 403,
not a silent hole).

### The WiFi password has two doors

`/api/wifi/:id/reveal` decrypts it — and so does a guest access pass with
`scope: "wifi"`, via `/api/guest/wifi` (`routes/guest.ts` runs `decryptSecret`
for any pass-bearing visitor). Blocking one without the other is decoration.
Software licenses store no product key, so WiFi is the only credential surface.

## Conventions

- **Tests** are pure functions pinned in `tests/*.test.mjs`, run with
  `node --test`. Security rules live as pure functions (`lib/authz.ts`,
  `arise-it-portal/worker/src/lib/agent-guards.ts`) precisely so the suite can
  pin them. Follow that rather than writing integration tests with mocks.
- **`tests/rls/access-control.test.mjs` skips itself without credentials.**
  An earlier note here called it a failing test; it is not. `requireDb` calls
  `t.skip` when neither `SUPABASE_DB_URL` nor `.supabase-db-password` is set, so
  a clean checkout runs `npm test` to 330 tests / 231 pass / 0 fail / 99 skipped
  and exit 0. A red suite is a real regression.
- **`arise-it-portal/frontend/tsconfig.tsbuildinfo` is no longer tracked.** It
  is TypeScript's incremental cache, and having it in git made the tree look
  dirty after every frontend build. It is now in that package's `.gitignore`.
- Root `tsconfig.json` **excludes `arise-it-portal`**; the portal has its own.
