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

## CI: two deploy paths, and the one that works

1. **`.github/workflows/deploy.yml`** — the repo's own pipeline, `on: push:
   branches: [main]`. Builds both Workers correctly. Does **not** run on PRs.
2. **Cloudflare Workers Builds** (Git integration, configured in the dashboard,
   posts `Workers Builds: arisehub` / `Workers Builds: arise-it` checks) — a
   second path that is **broken for both Workers**. Red checks from
   `cloudflare-workers-and-pages[bot]` on a PR are usually this, not your diff.

### Known breakage (verified 2026-09-15, both pre-existing on `main`)

**`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` vs `ANON_KEY`.** Every Supabase client
factory (`lib/supabase/client.ts`, `server.ts`, `middleware.ts`) reads
`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`. `deploy.yml` supplies
`NEXT_PUBLIC_SUPABASE_ANON_KEY`, which nothing reads. The key comes out
undefined, `createClient()` throws, and `next build` dies prerendering
`/login`. Same commit, only the name changed:

```
NEXT_PUBLIC_SUPABASE_ANON_KEY=…         → ✗ Error occurred prerendering page "/login"
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=…  → ✓ exit 0
```

It compiles and typechecks either way — only prerender fails, so a
typecheck-only gate never catches it. Fix is one line in `deploy.yml` plus the
same variable in the Workers Builds settings.

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
