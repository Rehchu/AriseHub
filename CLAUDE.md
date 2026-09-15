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

Three faults, and the first one hides the rest. **Two are now fixed in the
repository** (2026-09-15) and one is still a dashboard field:

1. ~~**Build variables are not set on either Worker.**~~ *Fixed in the repo.*
   Workers Builds has a *Build* variables screen separate from Settings →
   Variables & Secrets, and a runtime secret cannot satisfy a prerender — every
   `NEXT_PUBLIC_*` name is inlined at build time. Rather than depend on a screen
   nobody had filled in, the two public values are now committed as defaults in
   `lib/supabase/env.ts` (see below). A bare checkout builds with no environment
   at all: verified, `npm run build` with zero `NEXT_PUBLIC_*` set exits 0.
2. **The root build command produces the wrong directory** — and **it must stay
   that way until fault 3 is fixed.** The root `npm run build` is `next build`,
   which writes `.next/`, while the `arisehub` Worker's `wrangler.jsonc` serves
   `.open-next/assets`. Making it `opennextjs-cloudflare build` looks like the
   obvious fix. **It is actively destructive.** See the next section — this was
   tried on 2026-09-15 and it overwrote the IT portal.
3. **The `arise-it` build is pointed at the repo root**, exactly like the
   `arisehub` one. It installs the root `package.json`, runs
   `arisehub@0.1.0 build`, and never touches `arise-it-portal/`. The portal's
   own config, build script and frontend are irrelevant to it. This is why
   `arise-it` has not deployed since 2026-08-09 no matter what lands in the
   repo — two Workers, one build, and it is AriseHub's. **Nothing in the
   repository can fix this one**, because Root directory is per-Worker dashboard
   state.

So the remaining work is one field: Workers & Pages → `arise-it` → Settings →
Build → Root directory = `arise-it-portal/worker`, with Build command
`npm run build` and Deploy command `npx wrangler deploy`. `arisehub` needs
nothing now — its build runs the right command and needs no build variables.

**Workers Builds only builds the production branch**, so these fixes ship only
once they are on `main`.

### Never make the root `build` script produce `.open-next/` (2026-09-15)

Both Workers Builds are rooted at the repo root, so **both run the root
`npm run build` and then `npx wrangler deploy`** — including the one bound to
the `arise-it` Worker. That build has always failed, which is the only reason
it was harmless: it died at `next build` and never reached the deploy step.

Commit `62029a4` removed the two reasons it failed — it committed the Supabase
values so the prerender stopped throwing, and pointed the root `build` script at
`opennextjs-cloudflare build` so the output matched what the Worker serves. The
`arise-it` build then ran green all the way through and **deployed AriseHub onto
the `arise-it` Worker.** Verified from the deployed code: zero portal markers
(`church_session`, `arise_it_portal`, `wifiNetworks`, `decryptSecret` all absent),
729 hits for `open-next`, `NEXT_PUBLIC_IT_PORTAL_URL` present, 10.3 MB across
150,456 lines where the portal bundle is ~8,000.

Workers Builds binds a deploy to **its own** Worker. It does not honor the
`"name"` in the wrangler config it just built — naming `arisehub` there did not
stop it landing on `arise-it`.

So the root build script is deliberately `next build`, producing a `.next/` that
`wrangler deploy` cannot ship. That failure is a **safety interlock**, not an
oversight: it is the only thing standing between a green root build and the IT
portal being replaced by AriseHub. Remove it only after `arise-it`'s Root
directory is `arise-it-portal/worker`, so the two builds stop sharing one
command. Until then `arisehub` deploys via `npm run cf:build`, its dashboard
Build command, or `npm run deploy` by hand.

### The `build` script and `opennextjs-cloudflare` call each other

`opennextjs-cloudflare build` runs the Next build by shelling out, and with
nothing configured it runs **`npm run build`**
(`@opennextjs/aws/dist/build/buildNextApp.js:11-13`). So the moment the root
`build` script becomes `opennextjs-cloudflare build`, the two call each other
forever. `open-next.config.ts` pins `buildCommand: "next build"` to break that
loop. The pin stays whether or not `build` is ever changed back — it costs
nothing and it removes the trap.

### `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` vs `ANON_KEY` (fixed 2026-09-15)

Supabase renamed the anon key to the publishable key; same value, two names.
Every Supabase client factory read only the new name while `deploy.yml`
supplied the old one, so the key came out undefined, `createClient()` threw,
and `next build` died prerendering `/login`. It compiled and typechecked
either way — only prerender failed, so a typecheck-only gate never caught it.

Both names are now accepted, in one place: **`lib/supabase/env.ts`** — which
also **commits the project URL and publishable key as defaults**, so no build
needs either name set at all. Both values are public by construction: the same
URL is already in the portal's `wrangler.jsonc`, `/api/agent/token` hands the
publishable key to any caller, and Next inlines both into every browser bundle
shipped. RLS is what protects the data; hiding these protected nothing while
costing every deploy. Setting `NEXT_PUBLIC_SUPABASE_URL` to a *different*
project without also supplying a key now throws rather than silently
authenticating against the wrong database. Verified on the earlier commit, with
only `NEXT_PUBLIC_SUPABASE_ANON_KEY` set:

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
and braces. `tools/cron-worker/` had the identical exposure and was converted
to `wrangler.jsonc` the same way (2026-09-15); there is no `wrangler.toml` left
in this repository. Keep it that way — a new `.toml` beside a Worker is a
deploy aimed at whatever the nearest ancestor `.jsonc` names.

### Building locally

```bash
# AriseHub — no environment needed; the public values are committed.
# Note cf:build, not build: the root `build` script is next build on purpose.
npm ci && npx tsc --noEmit && npm run cf:build
# Optional overrides, e.g. to build against a different project (supply BOTH):
#   NEXT_PUBLIC_SUPABASE_URL=… NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=… npm run build
# Optional features, off when unset: NEXT_PUBLIC_VAPID_PUBLIC_KEY (web push),
#   NEXT_PUBLIC_TURNSTILE_SITE_KEY (bot protection).

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
