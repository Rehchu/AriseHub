-- AriseHub — contact privacy, ministry titles, short-lived invites.
--
-- 1. Personal contact details (email, phone) were visible to every signed-in
--    member. Now only leadership sees them: Super_Admin, IT_Admin, Staff, and
--    department leads — plus your own details, always.
--
-- 2. The Apostle and Pastor need to be *shown* as such. Their permission role
--    is Super_Admin; their ministry title is separate, because permissions and
--    what someone is called are different things.
--
-- 3. Invite links now expire in 24 hours by default. A link is a bearer secret:
--    the shorter it lives, the smaller the window if it's forwarded.
--
-- Apply after 0026.

-- ---------------------------------------------------------------------------
-- 1. Ministry title, distinct from permission role
-- ---------------------------------------------------------------------------
alter table profiles add column if not exists title text;

comment on column profiles.title is
  'Ministry title shown in the UI (Apostle, Pastor, Elder, Worship Leader…). '
  'Purely descriptive — permissions come from `role`, never from this.';

-- ---------------------------------------------------------------------------
-- 2. Who may see contact details
-- ---------------------------------------------------------------------------
create or replace function public.can_see_contact_info() returns boolean
  language sql stable security definer set search_path = public as $$
  select public.is_super_admin()
      or public.current_profile_role() in ('IT_Admin', 'Staff')
      or public.is_any_department_lead()
$$;

-- The directory everyone reads. Contact columns come back NULL unless the
-- caller is leadership or it's their own row.
--
-- security_invoker means the view still runs under the caller's RLS on
-- `profiles`, so campus/archive rules continue to apply.
create or replace view public.people_directory
with (security_invoker = true) as
select
  p.id,
  p.full_name,
  p.title,
  p.role,
  p.campus_id,
  p.photo_url,
  p.archived_at,
  p.created_at,
  case when public.can_see_contact_info() or p.user_id = auth.uid()
       then p.email end as email,
  case when public.can_see_contact_info() or p.user_id = auth.uid()
       then p.phone end as phone,
  -- So the UI can explain *why* contact details are hidden.
  public.can_see_contact_info() as contact_visible
from profiles p;

grant select on public.people_directory to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Invite links expire in 24 hours
-- ---------------------------------------------------------------------------
alter table invite_links
  alter column expires_at set default (now() + interval '24 hours');

-- Close any long-lived links already issued during the build.
update invite_links
set expires_at = least(coalesce(expires_at, now() + interval '24 hours'),
                       now() + interval '24 hours')
where active;
