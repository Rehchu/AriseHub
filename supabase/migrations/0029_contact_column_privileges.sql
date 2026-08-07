-- AriseHub — make the contact-privacy rule actually enforceable.
--
-- CRITICAL FIX. 0027 redacted email/phone in the people_directory view, but the
-- underlying policy is `profiles_select ... using (true)` and `authenticated`
-- still held SELECT on every column. So any signed-in member could open the
-- browser console and read every person's email, phone, address and emergency
-- contact straight out of `profiles`. The view was a suggestion, not a control.
--
-- RLS is row-level and cannot hide columns, so the fix is column privileges:
--   * `authenticated` loses SELECT on the personal columns entirely
--   * the directory view becomes the single read path, running as its owner so
--     its CASE gating is what decides who sees what
--   * UPDATE is granted separately, so people can still maintain their own
--     details even though they can no longer read anyone else's
--
-- service_role is unaffected, so the reminder cron still reads emails to send.
--
-- Apply after 0028.

-- ---------------------------------------------------------------------------
-- 1. Take the personal columns away from direct client reads
-- ---------------------------------------------------------------------------
revoke select (email, phone, birthday, address, emergency_contact, emergency_phone)
  on public.profiles from authenticated;
revoke select (email, phone, birthday, address, emergency_contact, emergency_phone)
  on public.profiles from anon;

-- Writing your own details is a different privilege from reading everyone's.
-- Row-level `profiles_update_own` still limits this to your own row, and the
-- 0028 trigger still freezes role/title/campus.
grant update (
  full_name, email, phone, photo_url, bio,
  birthday, address, emergency_contact, emergency_phone
) on public.profiles to authenticated;

-- ---------------------------------------------------------------------------
-- 2. The directory view becomes the read path
-- ---------------------------------------------------------------------------
-- Deliberately NOT security_invoker: the view runs as its owner so it can read
-- the columns the caller no longer can, and the CASE expressions below are the
-- access control. security_barrier stops a caller injecting a cheap function
-- into a WHERE clause to sniff redacted values.
--
-- No rows are hidden that weren't hidden before — profiles_select was
-- `using (true)`, i.e. every authenticated user could already see every row.
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
  p.archived_at,
  p.created_at,
  p.updated_at,
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
-- The view bypasses RLS, so it must re-assert that only signed-in people read it.
where auth.uid() is not null;

revoke all on public.people_directory from anon;
grant select on public.people_directory to authenticated;
