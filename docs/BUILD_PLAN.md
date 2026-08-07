# AriseHub — Build Plan (canonical, living)

One installable app, two backends, one login.

- **AriseHub** — Next.js App Router → Cloudflare Worker `arisehub`, live at
  **https://arisehub.myfaithtech.com**. Church data in **Supabase** (Postgres + RLS).
- **Arise-IT portal** — the existing Hono + D1 Worker `arise-it`, live at
  **https://itportal.myfaithtech.com** (`arise-it-portal/`). IT ops only.
- Giving stays in **Tithe.ly**. Elvanto is the source of truth for people/groups
  once its API key is configured.

Status: ✅ done · 🟡 partial · ⬜ pending · ❌ cut

---

## Access model (as decided by the church)

| Role | Who | Sees |
|---|---|---|
| `Super_Admin` | Apostle & Pastor | Everything, including Pastoral Care |
| `IT_Admin` | Bradly | IT portal + integrations; **not** church-wide admin |
| `Staff` | Church staff | Check-in, forms, reports, services |
| `Volunteer` / `Member` | Everyone else | Their own departments, groups, schedule |

- **Directory is church-wide** across both campuses; operational data
  (check-in, rooms, services, medical) stays **campus-scoped**.
- **Elders chat is private** — even Super_Admin cannot read it (`0016`).
- **Pastoral Care** is Super_Admin plus explicit grants only (`0020`).
- **Department heads** can invite to their own departments, capped at
  Member/Volunteer (`0018`).
- Public signup is **off**; people join through shareable invite links (`0017`).

---

## Modules — all built and deployed

| Module | Notes |
|---|---|
| **Dashboard** | Landing, module cards |
| **Messages** | Department chats + DMs, Realtime, unread badges, attachments (`0022`) |
| **Tasks** | Leadership→department, lead→member, self-logging |
| **People** | Church-wide directory, filters, one-tap DM |
| **Groups** | Finder, roles, meetings, attendance (`0006`) |
| **Calendar** | Events, room booking with double-booking prevention (`0012`) |
| **Services** | Plans, running order, accept/decline, availability (`0015`), schedule calendar (`0021`) |
| **Check-In** | Family registration + photos, security codes, rooms, **offline queue** |
| **Name tags** | Drag-and-drop studio: fonts, borders, shapes, clip art, DYMO presets (`0014`) |
| **Forms** | Connect Cards, public `/f/<slug>` (`0007`) |
| **Care** | Pastoral Kanban, tightly restricted (`0008`, `0020`) |
| **Reports** | Cross-module snapshot + 8-week attendance/growth trends |
| **Admin** | Campuses, departments, people, custom fields, care access, Elvanto |
| **IT** | Self-help for members; portal SSO for IT; password resets |
| **Search** | Global, Ctrl/Cmd-K, RLS-scoped |
| **PWA** | Installable on iOS/Android/Windows/macOS, Web Push |

---

## Integrations

- **Elvanto** (`0019`) — one-way sync in (people + groups), dry-run preview,
  sync history. ⬜ Needs `ELVANTO_API_KEY` set as a Worker secret.
  *Songs, services and calendar endpoints exist and are worth adding later —
  notably this makes a real song library possible again after 5E was cut.*
- **Resend** — transactional email as `arisehub@myfaithtech.com`.
- **Supabase Storage** — ⬜ needs public buckets `photos` and `attachments`.

---

## Outstanding

1. ⬜ Apply migrations **0021** and **0022** (see `PENDING_MIGRATIONS.md`).
2. ⬜ Create the two Storage buckets.
3. ⬜ **Rotate the Supabase keys** — they were shared in chat during the build.
4. ⬜ Push to GitHub (needs `gh` installed / a remote configured).
5. ⬜ Elvanto API key, after leadership approves.
6. ⬜ Run the print agent on the check-in desktop (`tools/print-agent`).

## Ideas not yet built

- Email digests ("here's your week") for people who don't install the PWA
- Kiosk mode for check-in (self-service, no staff)
- iCal feed for the public calendar
- Rotation auto-suggest in scheduling
- Bulk import of people from CSV
- Song library once Elvanto is connected

## Cut

- **5E Song library / 5F on-stage charts** — CCLI has no public API.
  *(Elvanto's songs endpoint reopens this if they connect it.)*
- **Background checks** — cut by the church.
