-- AriseHub — track background checks, and optionally enforce them.
--
-- `is_checkin_lead` is a bare boolean. It unlocks children's medical notes and
-- marks who supervises the desk, and it never expires — so a clearance from
-- three years ago looks identical to one from last month. Most insurers and
-- denominational child-protection policies require a renewal interval, and the
-- thing that goes wrong is never "nobody was checked", it is "nobody noticed
-- Sarah's lapsed in March".
--
-- Two deliberate choices about enforcement, both about not making Sunday worse:
--
--   * `require_current_clearance` defaults FALSE. Turning it on the morning of
--     a service and locking out every volunteer at once would be worse than the
--     gap it closes. Record first, look at who is lapsed, then switch it on.
--
--   * A MISSING date never blocks anyone — only a date in the PAST does.
--     Nobody has a record yet, so "missing = blocked" would lock out the entire
--     team the moment the setting flipped. Admin > People flags who has nothing
--     on file so the gap is visible rather than silently permitted.
--
-- Super_Admin is exempt regardless: the person who fixes this must not be able
-- to lock themselves out of the screen where they fix it.
--
-- Apply after 0044.

alter table profiles
  add column if not exists background_check_date date,
  add column if not exists background_check_expires date,
  add column if not exists safeguarding_training_date date;

comment on column profiles.background_check_expires is
  'When the background check lapses. NULL means nothing is on file — which is '
  'flagged in Admin > People but never blocks, because enforcing on absence '
  'would lock out everyone the day it is switched on.';

-- 0030 replaced the table-wide SELECT grant, so new columns need granting.
grant select (background_check_date, background_check_expires, safeguarding_training_date)
  on public.profiles to authenticated;

alter table checkin_settings
  add column if not exists require_current_clearance boolean not null default false;

comment on column checkin_settings.require_current_clearance is
  'When true, a volunteer whose background_check_expires is in the past loses '
  'check-in access. Off by default; turn it on once records exist.';

-- ---------------------------------------------------------------------------
-- Clearance is a privileged field
-- ---------------------------------------------------------------------------
-- Nobody sets their own clearance date, for the same reason nobody sets their
-- own role.
create or replace function public.protect_profile_privileged_fields() returns trigger
  language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if auth.uid() is not null and old.user_id = auth.uid() and not public.is_super_admin() then
    new.user_id                   := old.user_id;
    new.role                      := old.role;
    new.title                     := old.title;
    new.campus_id                 := old.campus_id;
    new.is_checkin_lead           := old.is_checkin_lead;
    new.archived_at               := old.archived_at;
    new.hidden_from_directory     := old.hidden_from_directory;
    new.background_check_date     := old.background_check_date;
    new.background_check_expires  := old.background_check_expires;
    new.safeguarding_training_date := old.safeguarding_training_date;
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Enforcement
-- ---------------------------------------------------------------------------
-- is_checkin_role() is the gate on the whole check-in surface: the roster,
-- creating people at the desk, families, guardians, recording an allergy. This
-- is the one place enforcement belongs, so a lapse closes all of it at once
-- rather than leaving a half-open door.
create or replace function public.is_checkin_role() returns boolean
  language sql stable security definer set search_path = public, pg_temp as $$
  select public.current_profile_role() in ('Super_Admin', 'Staff', 'Volunteer')
     and (
       public.current_profile_role() = 'Super_Admin'
       or not coalesce((select require_current_clearance from checkin_settings), false)
       -- NULL passes: nothing on file is a gap to surface, not a lockout.
       or coalesce(
            (select background_check_expires >= current_date
             from profiles where user_id = auth.uid()),
            true)
     )
$$;

comment on function public.is_checkin_role() is
  'Check-in access. Honours checkin_settings.require_current_clearance: when '
  'set, a background_check_expires date in the past revokes it. A missing date '
  'does not — see 0045.';
