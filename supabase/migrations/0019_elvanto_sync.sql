-- AriseHub — Elvanto integration (one-way: Elvanto → AriseHub).
--
-- Elvanto stays the source of truth for people and groups while both systems
-- run. AriseHub owns what Elvanto doesn't do (chat, tasks, care, check-in tags,
-- IT). Keeping the sync one-way avoids conflict resolution, which is where
-- two-way church-data syncs usually break.
--
-- Apply after 0018.

-- Stable link back to the Elvanto record so re-syncs UPDATE rather than
-- duplicate. Unique but nullable — AriseHub-native people simply have none.
alter table profiles add column if not exists elvanto_id text;
create unique index if not exists profiles_elvanto_idx on profiles(elvanto_id)
  where elvanto_id is not null;

alter table departments add column if not exists elvanto_id text;
create unique index if not exists departments_elvanto_idx on departments(elvanto_id)
  where elvanto_id is not null;

alter table groups add column if not exists elvanto_id text;
create unique index if not exists groups_elvanto_idx on groups(elvanto_id)
  where elvanto_id is not null;

-- Sync history: what ran, when, and what it touched. Also the audit trail for
-- "why did this person's details change?".
create table elvanto_syncs (
  id uuid primary key default gen_random_uuid(),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  status text not null default 'running'
    check (status in ('running', 'success', 'partial', 'failed')),
  people_created int not null default 0,
  people_updated int not null default 0,
  groups_created int not null default 0,
  groups_updated int not null default 0,
  errors text[],
  triggered_by uuid references profiles(id),
  notes text
);
create index elvanto_syncs_started_idx on elvanto_syncs(started_at desc);

alter table elvanto_syncs enable row level security;

-- Visible to admins/IT; writes happen server-side with the service role.
create policy elvanto_syncs_select on elvanto_syncs for select to authenticated
  using (public.is_super_admin() or public.current_profile_role() = 'IT_Admin');
