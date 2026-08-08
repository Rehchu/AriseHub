-- AriseHub — make "hidden" actually mean hidden.
--
-- 0036 gated hidden rows on can_see_contact_info(), and its comment described
-- the audience as "Leadership". Those are not the same set: 0027 defines
-- can_see_contact_info() as Super_Admin OR IT_Admin OR Staff OR *any department
-- lead*. So a service/QA account marked hidden still appeared for every
-- department head and all staff — most of the people it was meant to be hidden
-- from.
--
-- Super_Admin is the right gate. An account nobody can see is an account nobody
-- can revoke, so it must stay visible somewhere; that somewhere is Admin >
-- People, which is already Super_Admin-only (app/(app)/admin/people/page.tsx
-- redirects everyone else).
--
-- The row itself always sees itself, so a hidden account can still load its own
-- profile page.
--
-- Apply after 0036.

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
    or public.is_super_admin()   -- was can_see_contact_info(): far too wide
  );

revoke all on public.people_directory from anon;
grant select on public.people_directory to authenticated;

-- Admin > People writes this column. 0030 replaced the table-wide SELECT grant
-- with per-column grants but left UPDATE table-wide, so this works today by
-- accident. Granting it explicitly means the toggle keeps working when that
-- table-wide UPDATE is eventually tightened.
--
-- Safe to grant: profiles_update_own limits the row to your own, and the 0036
-- privileged-field trigger freezes this column for anyone who isn't Super_Admin.
grant update (hidden_from_directory) on public.profiles to authenticated;
