-- AriseHub — profiles that work normally but stay out of the directory.
--
-- Testing this app properly needs a real account: a real session, real RLS, real
-- pages. Until now that meant a stranger sitting in the People directory next to
-- actual members, and the only cleanup was deleting them afterwards — which then
-- meant creating another one next time.
--
-- `hidden_from_directory` fixes that. The account signs in, browses, and is
-- governed by exactly the same policies as anyone else — it simply does not
-- appear in the church-facing directory. Leadership still sees it in
-- Admin > People, because an account nobody can see is an account nobody can
-- revoke.
--
-- Apply after 0034.

alter table profiles
  add column if not exists hidden_from_directory boolean not null default false;

comment on column profiles.hidden_from_directory is
  'Keeps service/QA accounts out of the member-facing directory. Grants nothing '
  'and restricts nothing — visibility only. Leadership still sees these in '
  'Admin > People so they remain manageable.';

-- 0030 revoked table-wide SELECT, so every new column needs an explicit grant.
grant select (hidden_from_directory) on public.profiles to authenticated;

-- Only Super_Admin may hide or unhide someone. Members must not be able to
-- remove themselves from the directory, and a hidden account must not be able
-- to un-hide itself either, so this goes in the privileged-field trigger.
create or replace function public.protect_profile_privileged_fields() returns trigger
  language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and new.user_id = auth.uid() and not public.is_super_admin() then
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

-- The directory hides these rows from members. Leadership and the account
-- itself still see them — hidden means "not in the church directory", not
-- "invisible to the people responsible for the system".
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
    or public.can_see_contact_info()
  );

revoke all on public.people_directory from anon;
grant select on public.people_directory to authenticated;
