-- AriseHub — opt-in birthdays.
--
-- 0027 made birthdays leadership-only along with the rest of someone's personal
-- details, which is right by default but kills a thing churches actually use:
-- knowing whose birthday it is this week.
--
-- So it becomes a choice. `show_birthday` is off unless you turn it on, and
-- even then only the month and day are shared — never the year, because that is
-- an age, and an age is not what anyone wants from a birthday list.
--
-- Apply after 0032.

alter table profiles add column if not exists show_birthday boolean not null default false;

comment on column profiles.show_birthday is
  'Opt-in. When true, people_directory exposes birthday_md (MM-DD) to everyone. '
  'The full birthday stays leadership-only regardless.';

-- 0030 revoked table-wide SELECT, so new columns must be granted explicitly.
grant select (show_birthday) on public.profiles to authenticated;
grant update (show_birthday) on public.profiles to authenticated;

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
  p.show_birthday,
  -- Month and day only, and only if they said yes.
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
where auth.uid() is not null;

revoke all on public.people_directory from anon;
grant select on public.people_directory to authenticated;
