-- AriseHub — remove background-check tracking. Reverts 0045.
--
-- Built on a suggestion rather than a requirement: Arise doesn't run background
-- checks, so the dates would never have been filled in and the "no check on
-- file" badge would have sat on every row until it stopped meaning anything.
--
-- The reason to drop it rather than leave it switched off: 0045 wired
-- enforcement into is_checkin_role(), which gates the ENTIRE check-in surface —
-- the roster, registering people at the desk, families, guardians, recording an
-- allergy, room staffing. Every one of those policy evaluations was doing a
-- lookup against checkin_settings for a flag that was never going to be true.
-- The function goes back to the plain three-role check it was before.
--
-- The app stopped reading these columns in the previous deploy, so dropping
-- them now is safe.
--
-- Apply after 0049.

-- ---------------------------------------------------------------------------
-- 1. The hot path, back to how it was
-- ---------------------------------------------------------------------------
create or replace function public.is_checkin_role() returns boolean
  language sql stable security definer set search_path = public, pg_temp as $$
  select public.current_profile_role() in ('Super_Admin', 'Staff', 'Volunteer')
$$;

comment on function public.is_checkin_role() is
  'Who may run check-in: Super_Admin, Staff, Volunteer. Mirrored in '
  'lib/roles.ts, and tests/rls asserts the two still agree.';

-- ---------------------------------------------------------------------------
-- 2. Stop freezing fields that no longer exist
-- ---------------------------------------------------------------------------
create or replace function public.protect_profile_privileged_fields() returns trigger
  language plpgsql security definer set search_path = public, pg_temp as $$
begin
  -- OLD, not NEW: the row you are editing is yours based on what it was, not
  -- on what you are trying to make it (see 0038).
  if auth.uid() is not null and old.user_id = auth.uid() and not public.is_super_admin() then
    new.user_id               := old.user_id;
    new.role                  := old.role;
    new.title                 := old.title;
    new.campus_id             := old.campus_id;
    new.is_checkin_lead       := old.is_checkin_lead;
    new.archived_at           := old.archived_at;
    new.hidden_from_directory := old.hidden_from_directory;
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. The view stops carrying them
-- ---------------------------------------------------------------------------
drop view if exists public.people_directory;

create view public.people_directory
with (security_barrier = true) as
select
  p.id,
  p.user_id,
  p.full_name,
  p.title,
  p.role,
  p.campus_id,
  p.photo_url,
  p.bio,
  p.is_checkin_lead,
  p.hidden_from_directory,
  p.archived_at,
  p.created_at,
  p.updated_at,
  p.show_birthday,
  case when p.show_birthday and p.birthday is not null
       then to_char(p.birthday, 'MM-DD') end as birthday_md,
  case when public.can_see_contact_info() or p.user_id = auth.uid()
       then p.email end as email,
  case when public.can_see_contact_info() or p.user_id = auth.uid()
       then p.phone end as phone,
  case when public.can_see_contact_info() or p.user_id = auth.uid()
       then p.birthday end as birthday,
  case when public.can_see_contact_info() or p.user_id = auth.uid()
       then p.address end as address,
  case when public.can_see_contact_info() or p.user_id = auth.uid()
       then p.emergency_contact end as emergency_contact,
  case when public.can_see_contact_info() or p.user_id = auth.uid()
       then p.emergency_phone end as emergency_phone,
  public.can_see_contact_info() as contact_visible
from profiles p
where auth.uid() is not null
  and (
    not p.hidden_from_directory
    or p.user_id = auth.uid()
    or public.is_super_admin()
  );

revoke all on public.people_directory from anon;
grant select on public.people_directory to authenticated;

-- ---------------------------------------------------------------------------
-- 4. The columns
-- ---------------------------------------------------------------------------
alter table profiles
  drop column if exists background_check_date,
  drop column if exists background_check_expires,
  drop column if exists safeguarding_training_date;

alter table checkin_settings
  drop column if exists require_current_clearance;
