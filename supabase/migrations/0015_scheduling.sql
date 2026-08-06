-- AriseHub — volunteer scheduling: availability + blockout dates.
--
-- Two complementary signals, both self-service:
--   * blockout_dates    — "I can't serve these days" (vacation, work, travel)
--   * serving_patterns  — "I normally serve the 1st and 3rd Sunday"
--
-- Schedulers see both when assigning, so nobody gets booked on a day they
-- already said they're away. Everyone can READ availability (you can't schedule
-- around what you can't see) but only the person themselves — or Staff — can
-- change it. Apply after 0009.

create table blockout_dates (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles(id) on delete cascade,
  starts_on date not null,
  ends_on date not null,
  reason text,
  created_at timestamptz not null default now(),
  constraint blockout_range_ck check (ends_on >= starts_on)
);
create index blockout_profile_idx on blockout_dates(profile_id, starts_on);

-- Recurring pattern. weekday: 0=Sun … 6=Sat. weeks: which weeks of the month
-- they serve, e.g. [1,3] = 1st and 3rd. Empty/null weeks = every week.
create table serving_patterns (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles(id) on delete cascade,
  weekday int not null check (weekday between 0 and 6),
  weeks int[] not null default '{}',
  note text,
  created_at timestamptz not null default now(),
  unique (profile_id, weekday)
);
create index serving_patterns_profile_idx on serving_patterns(profile_id);

alter table blockout_dates enable row level security;
alter table serving_patterns enable row level security;

-- Readable by all authenticated (schedulers need to see who's away).
create policy blockout_select on blockout_dates
  for select to authenticated using (true);
create policy blockout_write on blockout_dates
  for all to authenticated
  using (profile_id = public.current_profile_id() or public.is_staff())
  with check (profile_id = public.current_profile_id() or public.is_staff());

create policy patterns_select on serving_patterns
  for select to authenticated using (true);
create policy patterns_write on serving_patterns
  for all to authenticated
  using (profile_id = public.current_profile_id() or public.is_staff())
  with check (profile_id = public.current_profile_id() or public.is_staff());
