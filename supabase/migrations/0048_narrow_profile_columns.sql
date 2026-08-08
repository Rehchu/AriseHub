-- AriseHub — stop every member reading every child's date of birth.
--
-- profiles_select has been `using (true)` since 0004 (directory_churchwide), so
-- row-level access is church-wide by design — the directory needs it, and every
-- embedded `profiles(full_name)` lookup across groups, tasks, messages and
-- service plans depends on it. Narrowing the POLICY would break all of that.
--
-- The problem was never the rows, it was the columns. 0030 replaced the
-- table-wide SELECT grant with a per-column list, and that list quietly
-- accumulated things nobody should be able to read church-wide:
--
--   date_of_birth              every child's exact date of birth
--   hidden_from_directory      which makes a "hidden" service account
--                              trivially discoverable — 0036/0037 hide rows
--                              from people_directory, but anyone could read the
--                              flag straight off profiles
--   background_check_*         the safeguarding status of every volunteer
--   membership_status          pastoral, not public
--   elvanto_id                 internal sync plumbing
--   has_allergy                a medical flag on a child
--
-- Those are revoked here. What legitimately needs them keeps working:
--
--   * check-in reads ages and allergy flags through `checkin_people`, a view
--     gated on is_checkin_role() — so the same volunteers can do the same job,
--     and nobody else can enumerate children's birthdays.
--   * Admin > People reads clearance through people_directory, gated on
--     is_super_admin(), which is already how contact details work.
--
-- Split deliberately. This migration only ADDS the gated read paths; 0049 does
-- the revoking, once the app is deployed and using them. Doing both at once
-- would break the live check-in page for however long the deploy takes.
--
-- Apply after 0047. Then deploy. Then 0049.

-- ---------------------------------------------------------------------------
-- What the check-in desk needs
-- ---------------------------------------------------------------------------
-- Deliberately NOT security_invoker: it runs as its owner so it can read the
-- columns the caller no longer can, and is_checkin_role() below is the access
-- control. security_barrier stops a caller smuggling a cheap function into a
-- WHERE clause to sniff values it shouldn't see.
--
-- Rows are unrestricted beyond that, matching profiles_select — this view
-- exists to gate COLUMNS by role, not to hide people.
drop view if exists public.checkin_people;

create view public.checkin_people
with (security_barrier = true) as
select
  p.id,
  p.full_name,
  p.campus_id,
  p.photo_url,
  p.photo_path,
  p.is_child,
  p.date_of_birth,
  p.has_allergy,
  p.archived_at
from profiles p
where public.is_checkin_role();

revoke all on public.checkin_people from anon;
grant select on public.checkin_people to authenticated;

comment on view public.checkin_people is
  'Ages and allergy flags for the check-in desk. Gated on is_checkin_role() '
  'because profiles no longer grants those columns church-wide — see 0048.';

-- ---------------------------------------------------------------------------
-- Clearance for Admin > People
-- ---------------------------------------------------------------------------
-- Same CASE-gating shape the contact columns already use.
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
  case when public.is_super_admin() then p.background_check_date end as background_check_date,
  case when public.is_super_admin() then p.background_check_expires end as background_check_expires,
  case when public.is_super_admin() then p.safeguarding_training_date end as safeguarding_training_date,
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
