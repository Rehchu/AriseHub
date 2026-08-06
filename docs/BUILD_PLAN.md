# AriseHub — Build Plan (canonical, living)

One installable app, two backends, one auth. **Supabase** (Postgres + RLS) for
church-management data; the existing **Arise-IT** Hono + D1 Worker (in
`../arise-it-portal`, unchanged) for IT ops. Frontend: Next.js App Router →
Cloudflare Workers via `@opennextjs/cloudflare`. Giving stays in Tithe.ly.

Status legend: ✅ done · 🟡 in progress / schema-written · ⬜ pending · ❌ cut

**Roles (clarified):** app `Super_Admin` = **Pastor & Apostle** (see everything). **IT_Admin** (Bradly) = IT-portal super-admin only, NOT app-wide — RLS `is_super_admin()` matches only `Super_Admin`. Church has **2 campuses**; the **directory is church-wide**, operational data (check-in/rooms/services/medical) stays **campus-scoped**.

### ⚠️ Pending Supabase migrations to apply (SQL editor, in order)
`0003_realtime_messages`, `0004_directory_churchwide`, `0005_tasks`, `0006_groups`. 0001/0002 already applied.

### Repo-inspired features to add (user approved all EXCEPT background checks)
From B1Admin / ChurchCRM / ecclesiaCRM — build natively (licensing/stack rule):
- ✅ **People directory** (5A) · ✅ **Groups + attendance + group roles** (5C, `0006`)
- ✅ **Connect Card forms** (`0007`): builder + public `/f/<slug>` guest submission (anon RLS) + responses viewer
- ⬜ **Custom fields** on people (5A)
- ✅ **Pastoral-care Kanban** (`0008`): visitation/follow-up board, Super_Admin+Staff only (sensitive)
- ⬜ **Service Plans + volunteer scheduling** (5D, study B1Admin "Plans")
- ⬜ **Custom fields** on people (5A) · ⬜ **Reporting surface** · ❌ background checks (cut by user)

### ⚠️ Migrations 0007 (forms) + 0008 (care) written, NOT yet applied.

---

## Phase 0 — Repo & source control
- 🟡 Monorepo under local git (this repo: `supabase/` + `arise-it-portal/`); **push to GitHub as `AriseHub` pending** (needs `gh auth`/OAuth).
- ⬜ Connect to Cloudflare Workers Builds (deploy-on-push), pointing IT builds at `arise-it-portal/`.

## Phase 1 — Supabase schema & RLS  (`supabase/migrations/0001`)
- ✅ Enums (`user_role`), tables: campuses, profiles (person ≠ login: `profiles.user_id` nullable so children/visitors have no auth row), profile_medical (split, gated by `is_checkin_lead`), families, family_members, guardians, rooms, services, service_assignments, checkins (no DELETE), chms_audit_log (service-role insert only).
- ✅ RLS on every table, `updated_at` triggers, SECURITY-DEFINER role/campus helpers, auto-profile-on-signup, self-escalation guard.
- ✅ **Applied + verified** (Supabase project `luzmqpfsylpqxbwzyjcz`): 8 departments seeded, 8 group-chat channels auto-created by trigger, all core tables present, RLS confirmed enforcing (anon key gets `[]` on `departments` and `profile_medical`).

## Phase 2 — Auth bridge + comms data
- 🟡 **Comms/invitations schema** (`supabase/migrations/0002`): departments (+seeded), department_members, channels/channel_members/messages (department group chats + DMs), invitations (+invitation_departments). Triggers wire roster↔chat and invite-consumption on signup. See README.
- ⬜ **Auth bridge** — modify Arise-IT `requireAuth` to also accept Supabase JWTs (JWKS), map identity by email to the D1 `users` row, keep the old `church_session` path behind a flag until proven. *Not deployed blind — needs a Supabase project to test against.*
- ⬜ Proxy `/api/it/*` through Next.js route handlers (same-origin).

## Phase 3 — App shell, navigation, PWA
- ✅ Next.js App Router app at repo root: Supabase SSR auth (`@supabase/ssr`, middleware session refresh + route gating, email/password login), dark Arise sidebar + light canvas, role-gated module switcher (Dashboard/Messages ready; People/Check-Ins/Groups/Calendar/Services/IT "Soon"), per-module muted accents, mobile drawer, dashboard landing. Verified in-browser against the live Supabase project.
- ✅ **Department chat + DMs over Supabase Realtime** (`0003` adds `messages` to the realtime publication): RLS-scoped channel list, thread with optimistic send, DM people-picker → `get_or_create_dm` RPC. Insert/read confirmed under RLS.
- ✅ **"Get IT Help"** persistent header action — short prefilled form (name/email from profile) → live Arise-IT public ticket API. Verified prefill; auth-bridge upgrade to an authenticated POST is Phase 2.
- ⬜ PWA via Serwist (manifest, NetworkFirst API cache, per-platform install incl. iOS instructional screen, web push).
- ⬜ **Deploy step pending:** apply `supabase/migrations/0003_realtime_messages.sql` (SQL editor) so cross-client live updates fire; without it, only your own optimistic sends show until refresh.

## Phase 4 — Check-in & badge printing
- ⬜ Print-job queue + local print agent (iPads can't talk to DYMO; Chrome 142+ gates localhost). `print_jobs`, `label_templates` (upload DYMO XML → bind named objects → tiered editor).
- ⬜ Child badge + matching guardian claim tag; allergy **visual indicator only** (specifics stay behind `profile_medical`).
- ⬜ Offline check-in (IndexedDB queue, client-generated codes, idempotent sync). Kiosk + staff-assisted modes; family-at-once; visitor flow; room auto-assign; capacity; checkout; reprint; attendance reporting.
- **Open:** DYMO model (SDK path + label stock), which machine runs the agent.

## Phase 5 — Platform modules
- **5A People** ⬜ — directory, custom fields, lists/saved searches, workflows (guest→connected), household merge/dup detection, photo upload (reuse R2), background-check tracking (`volunteer_clearances`, an enforced gate).
- **5B Calendar/facilities** ⬜ — events + materialized occurrences (RRULE), **conflict detection with setup/teardown buffers**, request/approval workflow, public + iCal feed, **resources↔D1-assets bridge** (a projector out for repair isn't bookable).
- **5C Groups** ⬜ — groups/memberships/meetings/attendance, mobile+offline attendance, leader self-service, group finder, reporting.
- **5D Services & volunteer scheduling** ⬜ — plan builder with running-time total, item types, scheduling (explicit accept/decline — never assume), blockout dates, conflict detection, rotation auto-suggest, position qualification (tied to clearances), team comms, plan templates/duplication. *No song library — plan items are free-form with optional file/note attachments (see cut below).*
- **5E Song library & charts** ❌ **CUT** — CCLI removed its public developer API; automated usage reporting/SongSelect integration isn't buildable.
- **5F On-stage chart access** ❌ **CUT** — depended on 5E; use forScore/OnSong if ever needed.
- **5G Communication** 🟡 — departments, per-department group chats, direct messages, invitations. Schema in `0002`; UI (Supabase Realtime) is Phase 3/5 frontend work.

### Cross-cutting
- Background checks as an enforced gate (scheduler + check-in refuse expired clearances; 60/30-day warnings).
- Messaging costs/consent: email via Resend (wired in Arise-IT already); SMS needs a provider + opt-in — **open budget decision**.
- Notifications/reminders via Cloudflare Cron Triggers; web push on installed PWAs.
- One reporting surface; global search across people/groups/events/assets.

## Phase 6 — Port the Arise-IT UI into AriseHub
- ⬜ Rebuild asset/ticket/wifi/consumables/licenses/access-pass/audit/dashboard pages as Next.js against the D1 API.
- ⬜ **Keep on the standalone Worker:** public `/request` + guest `/go` boards (unauthenticated — don't precache behind an authed shell).
- ⬜ Asset label printing on Avery 5160 sheet PDF (print-at-100%).

## Phase 7 — Arise-IT live bugs
- ✅ Guest WiFi pass no longer leaks staff networks (per-pass `wifi_all_networks` toggle; guest-only default).
- ✅ New-ticket email notifications to super-admins (public + staff create paths).
- ⬜ Optional: `expires_at` on access passes (rotation exists; passes never expire yet).

## Cloudflare free-tier features to enable (as relevant)
- **Turnstile** on `/request` and `/go` (bot protection beyond honeypot+rate-limit) — wire once a widget exists.
- WAF Free Managed Ruleset + a couple Custom Rules, Leaked Credential Checks — dashboard toggles.
- Cron Triggers for reminders; Queues/Durable Objects available on free tiers if needed later.

## Open decisions (non-blocking for schema work)
DYMO model · agent host machine · AriseHub subdomain (e.g. `hub.myfaithtech.com`) · IT_Admin scope (org-wide vs campus) → Phase 2 role map · SMS provider/budget · on Planning Center? (migration data).
