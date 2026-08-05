# AriseHub

Single installable app for Arise Church — church management (ChMS) **and** IT operations. Two backends, one auth system, one PWA.

- **Supabase (Postgres + RLS)** — new ChMS data: profiles, families, check-in, services (this repo, `supabase/`).
- **Arise-IT (existing Hono + D1 Worker at `D:\projects\church-it-portal`)** — IT ops, unchanged: assets, WiFi, tickets, consumables, licenses, access passes, audit log.

Frontend: Next.js App Router, deployed to **Cloudflare Workers** (static assets) via `@opennextjs/cloudflare` — same deployment story as Arise-IT. Not built yet (Phase 3).

Giving stays in **Tithe.ly** — AriseHub never stores donation data.

## Status
- **Phase 1 (this) — Supabase schema + RLS: written, not yet applied.** Needs a Supabase project.
- Phases 2–7: pending. See the build plan.

## Phase 1 — apply the schema

1. Create a Supabase project at [supabase.com](https://supabase.com).
2. Apply the migration — either:
   - **SQL editor:** paste `supabase/migrations/0001_phase1_schema.sql` and run, or
   - **CLI:** `supabase link --project-ref <ref>` then `supabase db push`.
3. Have these three values ready for the app + auth bridge (Phase 2): project **URL**, **anon key**, **service-role key** (Settings → API).

### What it creates
`campuses`, `profiles` (+ `profile_medical` split out), `families`, `family_members`, `guardians`, `rooms`, `services`, `service_assignments`, `checkins`, `chms_audit_log` — with RLS on every table, `updated_at` triggers, and SECURITY-DEFINER helper functions for role/campus checks.

### Key access-control decisions baked in
- **Soft deletes** on profiles (`archived_at`) — never hard-delete.
- **`profiles.is_checkin_lead`** — the "explicit check-in role" from the plan. `profile_medical` (allergies/medical) is readable ONLY by Super_Admin or a profile with `is_checkin_lead = true`, so children's medical info is never exposed to general Staff/Volunteers who can see the directory.
- **Campus-scoped**: non-super-admins only see/act on their own campus.
- **`checkins` has no DELETE policy** — it's a child-safety audit record.

## Phase 1 — verify (run after applying, per the build plan)
- Create a Volunteer profile → confirm it **cannot** `SELECT` from `profile_medical`.
- Set a profile's `campus_id` to campus A → confirm it cannot read campus B's `rooms`/`checkins`.
- Attempt `DELETE FROM checkins` as any role → confirm no policy permits it.
- Confirm a Staff profile can read the directory (`profiles`) but not `profile_medical`.

## Next (needs your Supabase project)
Once the project exists and the migration is applied, Phase 2 modifies Arise-IT's `requireAuth` to verify Supabase JWTs (via JWKS) and maps identity by email to the existing D1 `users` row — single login across both halves.
