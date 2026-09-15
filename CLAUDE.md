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
   second path that is **broken for both Workers**. Red checks from
   `cloudflare-workers-and-pages[bot]` on a PR are usually this, not your diff.

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

**`arise-it` resolves the wrong wrangler config.** Run wrangler from
`arise-it-portal/worker` without `-c` and it picks up the repo-root
`wrangler.jsonc` (AriseHub's Next worker) and dies on a missing
`.open-next/assets`. Always `-c wrangler.toml` there. A Workers Build left at
its defaults does the same thing, which is why `arise-it` last deployed
2026-08-09.

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
cd arise-it-portal/worker   && npx wrangler deploy --dry-run -c wrangler.toml
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
- **`tests/rls/access-control.test.mjs` fails on a clean checkout.**
  Pre-existing; don't chase it, and don't claim a suite is green without saying
  so. Everything else passes.
- **`arise-it-portal/frontend/tsconfig.tsbuildinfo` is tracked**, so the tree
  looks dirty after any frontend build. It's TypeScript's incremental cache —
  revert it, don't commit it. It arguably belongs in `.gitignore`.
- Root `tsconfig.json` **excludes `arise-it-portal`**; the portal has its own.
