-- AriseHub — self-service profiles, and a fix for a real privilege gap.
--
-- 1. SECURITY FIX. 0027 added profiles.title but did not add it to the
--    privileged-field guard, so any member could set their own title to
--    "Apostle" or "Pastor". Titles are shown next to names throughout the app,
--    so that is an impersonation hole. Only Super_Admin may set a title now.
--
-- 2. People need to maintain their own profile: bio, phone, email, and a few
--    optional details. Name, email and phone are required by the form; the
--    rest are optional. Personal details stay leadership-only, matching 0027.
--
-- Apply after 0027.

-- ---------------------------------------------------------------------------
-- 1. Lock down `title` (and re-assert the rest of the privileged fields)
-- ---------------------------------------------------------------------------
create or replace function public.protect_profile_privileged_fields() returns trigger
  language plpgsql security definer set search_path = public as $$
begin
  -- Editing your own row? Then permissions and identity markers are read-only.
  -- Everything else on the row (name, contact, bio…) you may change freely.
  if auth.uid() is not null and new.user_id = auth.uid() and not public.is_super_admin() then
    new.role            := old.role;
    new.title           := old.title;   -- added: was missing, allowed self-titling
    new.campus_id       := old.campus_id;
    new.is_checkin_lead := old.is_checkin_lead;
    new.archived_at     := old.archived_at;
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. Self-service profile fields
-- ---------------------------------------------------------------------------
alter table profiles add column if not exists bio text;
alter table profiles add column if not exists birthday date;
alter table profiles add column if not exists address text;
alter table profiles add column if not exists emergency_contact text;
alter table profiles add column if not exists emergency_phone text;

comment on column profiles.bio is
  'Short self-written introduction. Visible to everyone in the directory.';
comment on column profiles.emergency_phone is
  'Leadership-only, like email and phone — see can_see_contact_info().';

-- ---------------------------------------------------------------------------
-- 3. Directory view carries the new fields, with the same privacy rule
-- ---------------------------------------------------------------------------
-- A bio is written to be read, so it is public to signed-in members. Birthday,
-- address and emergency contact are personal details and follow email/phone.
--
-- Dropped rather than replaced: `create or replace view` cannot add a column in
-- the middle of the list, and `bio` belongs next to the other display fields.
drop view if exists public.people_directory;

create view public.people_directory
with (security_invoker = true) as
select
  p.id,
  p.full_name,
  p.title,
  p.role,
  p.campus_id,
  p.photo_url,
  p.bio,
  p.archived_at,
  p.created_at,
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
from profiles p;

grant select on public.people_directory to authenticated;
