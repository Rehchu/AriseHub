-- Announcements (F6) and prayer requests (F8).
--
-- Two small, self-contained modules that share a shape: somebody submits,
-- somebody else acts on it.
--
-- ANNOUNCEMENTS: ministry leaders ask for something to run on a date range; an
-- approver promotes it into the app feed and the Media checklist. The doc left
-- the approver owner open (Open Question #6), so approval sits with the services
-- role for now — the same people who build the slides it ends up on.
--
-- PRAYER: visibility is deliberately ONE flag, public or prayer-team-only, not a
-- tier system. That was an explicit simplification once the pastoral-care log
-- was cut: the five roles plus prayer-team membership already cover access.

create table if not exists public.announcements (
  id uuid primary key default gen_random_uuid(),
  campus_id uuid references public.campuses(id),
  submitted_by uuid references public.profiles(id) on delete set null,
  title text not null,
  body text,
  starts_on date,
  ends_on date,
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected')),
  review_note text,
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  show_in_app boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists announcements_status_idx
  on public.announcements (status, starts_on);
create index if not exists announcements_run_idx
  on public.announcements (starts_on, ends_on)
  where status = 'approved';

alter table public.announcements enable row level security;

-- Submitters always see their own, even while pending; everyone else sees only
-- what was approved AND meant for the app.
drop policy if exists announcements_read on public.announcements;
create policy announcements_read on public.announcements
  for select using (
    public.is_services_role()
    or submitted_by = public.current_profile_id()
    or (status = 'approved' and show_in_app)
  );

drop policy if exists announcements_insert on public.announcements;
create policy announcements_insert on public.announcements
  for insert with check (submitted_by = public.current_profile_id() or public.is_services_role());

-- A submitter may fix their own wording while it is still pending; once it has
-- been reviewed only the approver can change it.
drop policy if exists announcements_update on public.announcements;
create policy announcements_update on public.announcements
  for update using (
    public.is_services_role()
    or (submitted_by = public.current_profile_id() and status = 'pending')
  ) with check (
    public.is_services_role()
    or (submitted_by = public.current_profile_id() and status = 'pending')
  );

drop policy if exists announcements_delete on public.announcements;
create policy announcements_delete on public.announcements
  for delete using (
    public.is_services_role() or submitted_by = public.current_profile_id()
  );

drop trigger if exists t_announcements_upd on public.announcements;
create trigger t_announcements_upd before update on public.announcements
  for each row execute procedure extensions.moddatetime(updated_at);

create table if not exists public.prayer_requests (
  id uuid primary key default gen_random_uuid(),
  campus_id uuid references public.campuses(id),
  person_id uuid references public.profiles(id) on delete set null,
  submitted_name text,
  contact text,
  body text not null,
  visibility text not null default 'prayer_team_only'
    check (visibility in ('public', 'prayer_team_only')),
  status text not null default 'open'
    check (status in ('open', 'praying', 'answered', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists prayer_requests_status_idx
  on public.prayer_requests (status, created_at desc);

alter table public.prayer_requests enable row level security;

-- A request is readable by the person who asked, the prayer team, and — only if
-- they chose to make it public — everyone. Nothing here is visible to staff by
-- default: a prayer request is not administrative data.
drop policy if exists prayer_read on public.prayer_requests;
create policy prayer_read on public.prayer_requests
  for select using (
    public.is_super_admin()
    or person_id = public.current_profile_id()
    or visibility = 'public'
    or exists (
      select 1
        from public.department_members dm
        join public.departments d on d.id = dm.department_id
       where dm.profile_id = public.current_profile_id()
         and d.slug in ('prayer', 'prayer-team')
    )
  );

drop policy if exists prayer_insert on public.prayer_requests;
create policy prayer_insert on public.prayer_requests
  for insert with check (auth.uid() is not null);

drop policy if exists prayer_update on public.prayer_requests;
create policy prayer_update on public.prayer_requests
  for update using (
    public.is_super_admin()
    or exists (
      select 1
        from public.department_members dm
        join public.departments d on d.id = dm.department_id
       where dm.profile_id = public.current_profile_id()
         and d.slug in ('prayer', 'prayer-team')
    )
  ) with check (
    public.is_super_admin()
    or exists (
      select 1
        from public.department_members dm
        join public.departments d on d.id = dm.department_id
       where dm.profile_id = public.current_profile_id()
         and d.slug in ('prayer', 'prayer-team')
    )
  );

drop trigger if exists t_prayer_upd on public.prayer_requests;
create trigger t_prayer_upd before update on public.prayer_requests
  for each row execute procedure extensions.moddatetime(updated_at);

comment on table public.announcements is
  'Ministry leaders submit announcements with the dates they should run; an '
  'approver promotes them into the app feed and the Media checklist.';
comment on table public.prayer_requests is
  'Prayer requests routed to the prayer team. Visibility is deliberately a '
  'single flag — public or prayer team only — not a tier system.';
