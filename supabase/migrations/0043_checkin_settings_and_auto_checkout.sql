-- AriseHub — make pickup verification optional, and close out forgotten check-ins.
--
-- Two things the church actually needs:
--
-- 1. Pickup verification is right for kids' ministry on a Sunday morning, and
--    wrong for a midweek service where the child simply leaves with their
--    parents at the end. Making it a Super_Admin toggle rather than a code
--    change means it can follow whatever the service actually is.
--
-- 2. Nobody checks every child out. Rows sit in `checked_in` forever, so the
--    roster is wrong the following week and the "currently checked in" count is
--    meaningless. A cutoff per weekday closes them automatically.
--
-- Times are stored as a local wall-clock time plus the weekday, NOT as UTC.
-- Sunday 13:30 in Pineville is 18:30 UTC in summer and 19:30 UTC in winter; a
-- UTC cron would drift by an hour twice a year and start closing children out
-- mid-service. The job resolves local time per campus using campuses.timezone.
--
-- Apply after 0042.

-- ---------------------------------------------------------------------------
-- Settings (single row)
-- ---------------------------------------------------------------------------
create table if not exists checkin_settings (
  -- Singleton: the check constraint makes a second row impossible.
  id boolean primary key default true check (id),
  require_pickup_verification boolean not null default true,
  auto_checkout_enabled boolean not null default true,
  updated_at timestamptz not null default now(),
  updated_by uuid references profiles(id)
);

comment on column checkin_settings.require_pickup_verification is
  'When true the station must name who collected the child, or record why it '
  'released to someone not on the pickup list. When false a check-out is one '
  'tap — for services where children just leave with their parents.';

insert into checkin_settings (id) values (true) on conflict (id) do nothing;

create trigger t_checkin_settings_upd before update on checkin_settings
  for each row execute procedure extensions.moddatetime(updated_at);

-- ---------------------------------------------------------------------------
-- Auto-checkout schedule
-- ---------------------------------------------------------------------------
create table if not exists checkin_auto_checkout_rules (
  id uuid primary key default gen_random_uuid(),
  day_of_week int not null check (day_of_week between 0 and 6),  -- 0 = Sunday
  at_time time not null,
  active boolean not null default true,
  label text,
  created_at timestamptz not null default now(),
  unique (day_of_week, at_time)
);

comment on table checkin_auto_checkout_rules is
  'Local wall-clock cutoffs per weekday. Anyone still checked in at a campus '
  'past that campus''s local time is closed out with checked_out_by null, '
  'which is what marks it automatic rather than a volunteer''s action.';

insert into checkin_auto_checkout_rules (day_of_week, at_time, label) values
  (0, '13:30', 'Sunday service'),
  (1, '20:30', 'Monday evening'),
  (3, '20:30', 'Wednesday evening')
on conflict (day_of_week, at_time) do nothing;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table checkin_settings enable row level security;
alter table checkin_auto_checkout_rules enable row level security;

-- The station reads settings on every load to know which pickup flow to show,
-- so every signed-in user may read. Only Super_Admin changes them.
create policy checkin_settings_select on checkin_settings
  for select to authenticated using (true);
create policy checkin_settings_write on checkin_settings
  for all to authenticated
  using (public.is_super_admin()) with check (public.is_super_admin());

create policy checkin_auto_rules_select on checkin_auto_checkout_rules
  for select to authenticated using (true);
create policy checkin_auto_rules_write on checkin_auto_checkout_rules
  for all to authenticated
  using (public.is_super_admin()) with check (public.is_super_admin());

-- ---------------------------------------------------------------------------
-- Mark an automatic close-out as such
-- ---------------------------------------------------------------------------
alter table checkins
  add column if not exists auto_checked_out boolean not null default false;

comment on column checkins.auto_checked_out is
  'True when the scheduled job closed this out rather than a volunteer. Keeps '
  'the attendance record honest — it says nobody was verified at pickup.';
