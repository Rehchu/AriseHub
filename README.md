# AriseHub

Single installable app for Arise Church — church management (ChMS) **and** IT operations. Two backends, one auth system, one PWA.

- **Supabase (Postgres + RLS)** — new ChMS data: profiles, families, check-in, services (this repo, `supabase/`).
- **Arise-IT (existing Hono + D1 Worker at `D:\projects\church-it-portal`)** — IT ops, unchanged: assets, WiFi, tickets, consumables, licenses, access passes, audit log.

Frontend: Next.js App Router, deployed to **Cloudflare Workers** (static assets) via `@opennextjs/cloudflare` — same deployment story as Arise-IT. Not built yet (Phase 3).

Giving stays in **Tithe.ly** — AriseHub never stores donation data.

## Status
- **Phase 1 (this) — Supabase schema + RLS: written, not yet applied.** Needs a Supabase project.
- Phases 2–7: pending. See the build plan.

## Messaging, departments & invitations (`migration 0002`)
Delivers three product requirements, schema-first (apply after `0001`):

- **Invite anyone by email** with a role + one or more **departments** (Volunteers, Praise Team, Staff, Elders, Leadership, IT, Media, Creatives — all seeded; add more anytime). `invitations` (+ `invitation_departments`) hold the pending invite; the app emails a link (Resend). On signup, the `handle_new_auth_user` trigger consumes a matching pending invite — the new profile automatically adopts the invited **role**, **campus**, and **department memberships**.
- **A group chat per department**, created automatically. `channels(type='department')` is made by a trigger when a department is created, and its membership *follows the department roster* — join a department and you're in its chat; leave and you're out. No manual chat admin.
- **Direct messages** between any two people via `get_or_create_dm(other_profile)` — finds or creates the 1:1 channel.
- Model: `channels` → `channel_members` → `messages` (soft-deletable, editable by author). Built for **Supabase Realtime**: the client subscribes to `messages` filtered by `channel_id`, and RLS guarantees you only receive rows for channels you belong to.
- RLS: read/post only in your own channels; edit/delete only your own messages; department leads (or Super_Admin) manage their roster; invitations are Super_Admin-only and accepted server-side (not a client write).

## Easier IT support tickets (design — lands in Phase 2 + Phase 6)
Because everyone will have an AriseHub account, submitting an IT request should be one click, no re-login, no re-typing who they are:
- The **auth bridge** (Phase 2) makes the AriseHub session valid against the existing Arise-IT D1 API, so a logged-in user can POST to `/api/tickets` as themselves.
- The shell gets a persistent **"Get IT Help"** action (header + a card on the dashboard). It opens a short form (subject, category, urgency, details) and submits with the user's identity + campus **prefilled** from their profile — the request lands in the IT Ticket Queue already attributed, and the existing new-ticket email notification fires to IT.
- The unauthenticated `/request` form stays as the fallback for people without accounts (guests, first-time visitors).

## Scope decisions
- **Phase 5E (Song library & charts) and 5F (On-stage chart access) are cut.** CCLI removed its public developer API, so automated CCLI usage reporting and SongSelect integration aren't buildable; churches use their own CCLI login instead. Phase 5D (Services/volunteer scheduling) stays, but without a reusable song catalog or transposition — it can attach files/notes to plan items ad-hoc.
- Giving stays in Tithe.ly (never stored here).

## Phase 1 — apply the schema

1. Create a Supabase project at [supabase.com](https://supabase.com).
2. Apply the migration — either:
   - **SQL editor:** paste `supabase/migrations/0001_phase1_schema.sql` and run, or
   - **CLI:** `supabase link --project-ref <ref>` then `supabase db push`.
3. Have these three values ready for the app + auth bridge (Phase 2): project **URL**, **anon key**, **service-role key** (Settings → API).

### What it creates
`campuses`, `profiles` (+ `profile_medical` split out), `families`, `family_members`, `guardians`, `rooms`, `services`, `service_assignments`, `checkins`, `chms_audit_log` — with RLS on every table, `updated_at` triggers, and SECURITY-DEFINER helper functions for role/campus checks.

### Key access-control decisions baked in
- **A profile is a PERSON, not a login.** `profiles.id` is its own uuid; `profiles.user_id` is a nullable link to `auth.users`. Children, visitors, and non-login members have `user_id = null` — essential, since check-in creates child profiles that will never have an auth account. Staff/admins with a Supabase login have `user_id` set.
- **Auto-provisioning**: a trigger on `auth.users` creates a `Member` profile on signup, so there's never an authenticated user without a profile (the RLS helpers depend on it). An admin elevates the role afterward.
- **Self-escalation blocked**: members can edit their own name/phone/photo, but a `before update` trigger forces `role`/`campus_id`/`is_checkin_lead`/`archived_at` back to their old values for non-admins — so a Member can't set themselves to `Super_Admin` (which the row-level "edit own profile" policy alone would allow).
- **Soft deletes** on profiles (`archived_at`) — never hard-delete.
- **`profiles.is_checkin_lead`** — the "explicit check-in role" from the plan. `profile_medical` (allergies/medical) is readable ONLY by Super_Admin or a profile with `is_checkin_lead = true`, so children's medical info is never exposed to general Staff/Volunteers who can see the directory.
- **Campus-scoped**: non-super-admins only see/act on their own campus.
- **`checkins` has no DELETE policy** — it's a child-safety audit record.
- **`chms_audit_log` inserts are service-role only** (no authenticated INSERT policy) so the audit trail can't be forged or tampered with from a client.

## Phase 1 — verify (run after applying, per the build plan)
- Create a Volunteer profile → confirm it **cannot** `SELECT` from `profile_medical`.
- Set a profile's `campus_id` to campus A → confirm it cannot read campus B's `rooms`/`checkins`.
- Attempt `DELETE FROM checkins` as any role → confirm no policy permits it.
- Confirm a Staff profile can read the directory (`profiles`) but not `profile_medical`.
- As a Member, `update profiles set role = 'Super_Admin' where user_id = auth.uid()` → confirm the role stays `Member` (the trigger reverts it) while a name change on the same row succeeds.
- Sign up a new auth user → confirm a matching `Member` profile row is auto-created.

## Next (needs your Supabase project)
Once the project exists and the migration is applied, Phase 2 modifies Arise-IT's `requireAuth` to verify Supabase JWTs (via JWKS) and maps identity by email to the existing D1 `users` row — single login across both halves.
