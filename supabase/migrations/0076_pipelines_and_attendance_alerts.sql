-- Follow-up pipeline (F7) and attendance drop-off alerts (F11).
--
-- The pair the doc calls the retention work. A pipeline is the thing PCO and
-- Elvanto leave open: not "a guest visited" but a named person responsible at
-- every stage, and a nag when somebody stalls.
--
-- Cards carry person_name/contact as well as person_id because a first-time
-- guest often has no profile yet — insisting on one would mean either not
-- tracking them or creating half-empty member records.

create table if not exists public.pipelines (
  id uuid primary key default gen_random_uuid(),
  campus_id uuid references public.campuses(id),
  name text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.pipeline_stages (
  id uuid primary key default gen_random_uuid(),
  pipeline_id uuid not null references public.pipelines(id) on delete cascade,
  position int not null default 0,
  name text not null,
  -- How long a card may sit here before it is considered stalled.
  stall_days int not null default 14
);

create index if not exists pipeline_stages_pipeline_idx
  on public.pipeline_stages (pipeline_id, position);

create table if not exists public.pipeline_cards (
  id uuid primary key default gen_random_uuid(),
  pipeline_id uuid not null references public.pipelines(id) on delete cascade,
  stage_id uuid not null references public.pipeline_stages(id) on delete cascade,
  person_id uuid references public.profiles(id) on delete set null,
  person_name text,
  contact text,
  assigned_to uuid references public.profiles(id) on delete set null,
  -- Reset when a card moves; this is what a stall check reads.
  entered_stage_at timestamptz not null default now(),
  notes text,
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists pipeline_cards_stage_idx
  on public.pipeline_cards (stage_id, entered_stage_at);
create index if not exists pipeline_cards_open_idx
  on public.pipeline_cards (pipeline_id, entered_stage_at)
  where closed_at is null;

create table if not exists public.attendance_alerts (
  id uuid primary key default gen_random_uuid(),
  campus_id uuid references public.campuses(id),
  person_id uuid not null references public.profiles(id) on delete cascade,
  baseline text,
  weeks_absent int not null default 0,
  flagged_at timestamptz not null default now(),
  status text not null default 'new'
    check (status in ('new', 'assigned', 'resolved', 'dismissed')),
  assigned_to uuid references public.profiles(id) on delete set null,
  note text
);

-- One OPEN alert per person. A weekly job that re-flags the same family every
-- Sunday until someone calls them is noise, and noise gets ignored.
create unique index if not exists attendance_alerts_open_person_idx
  on public.attendance_alerts (person_id)
  where status in ('new', 'assigned');

alter table public.pipelines enable row level security;
alter table public.pipeline_stages enable row level security;
alter table public.pipeline_cards enable row level security;
alter table public.attendance_alerts enable row level security;

drop policy if exists pipelines_read on public.pipelines;
create policy pipelines_read on public.pipelines
  for select using (public.is_services_role() or public.is_any_department_lead());
drop policy if exists pipelines_write on public.pipelines;
create policy pipelines_write on public.pipelines
  for all using (public.is_services_role()) with check (public.is_services_role());

drop policy if exists stages_read on public.pipeline_stages;
create policy stages_read on public.pipeline_stages
  for select using (public.is_services_role() or public.is_any_department_lead());
drop policy if exists stages_write on public.pipeline_stages;
create policy stages_write on public.pipeline_stages
  for all using (public.is_services_role()) with check (public.is_services_role());

-- Whoever a card is assigned to can work it, which is the whole point of
-- assigning it; leads can see the board without being able to touch others'.
drop policy if exists cards_read on public.pipeline_cards;
create policy cards_read on public.pipeline_cards
  for select using (
    public.is_services_role()
    or assigned_to = public.current_profile_id()
    or public.is_any_department_lead()
  );
drop policy if exists cards_write on public.pipeline_cards;
create policy cards_write on public.pipeline_cards
  for all using (
    public.is_services_role() or assigned_to = public.current_profile_id()
  ) with check (
    public.is_services_role() or assigned_to = public.current_profile_id()
  );

drop policy if exists alerts_read on public.attendance_alerts;
create policy alerts_read on public.attendance_alerts
  for select using (
    public.is_services_role() or assigned_to = public.current_profile_id()
  );
drop policy if exists alerts_write on public.attendance_alerts;
create policy alerts_write on public.attendance_alerts
  for all using (
    public.is_services_role() or assigned_to = public.current_profile_id()
  ) with check (
    public.is_services_role() or assigned_to = public.current_profile_id()
  );

drop trigger if exists t_pipeline_cards_upd on public.pipeline_cards;
create trigger t_pipeline_cards_upd before update on public.pipeline_cards
  for each row execute procedure extensions.moddatetime(updated_at);

comment on table public.pipeline_cards is
  'Someone moving through a follow-up pipeline. entered_stage_at is what a '
  'stall check reads: a card sitting past its stage stall_days needs a person, '
  'not a report.';
comment on table public.attendance_alerts is
  'A family who attended regularly and has stopped. One open alert per person '
  'at a time, enforced by a partial unique index, so a weekly job cannot pile '
  'up duplicates.';
