-- AriseHub — department heads can invite, and check-in staff can register families.
--
-- 1. Invite links: a department lead may create links for departments THEY lead
--    (a Praise Team leader can invite to Praise Team, not to Elders). Super_Admin
--    is unrestricted. Leads only see and manage the links they created.
--
-- 2. Family registration: check-in staff need to create parent and child
--    profiles at the desk. Those people have no login (profiles.user_id is null),
--    so the existing profiles_admin_write policy (Super_Admin only) blocked it.
--
-- Apply after 0017.

-- ---------------------------------------------------------------------------
-- 1. Invite links for department leads
-- ---------------------------------------------------------------------------

-- True when every department in `depts` is one the caller leads. An empty array
-- is allowed (a general invite that joins no department).
create or replace function public.leads_all_departments(depts uuid[]) returns boolean
  language sql stable security definer set search_path = public as $$
  select not exists (
    select 1
    from unnest(coalesce(depts, '{}'::uuid[])) as d(id)
    where not public.is_department_lead(d.id)
  )
$$;

drop policy if exists invite_links_admin on invite_links;

-- Super_Admin sees everything; a lead sees the links they created.
create policy invite_links_select on invite_links for select to authenticated
  using (public.is_super_admin() or created_by = public.current_profile_id());

-- A lead may only issue links for departments they lead, and only at roles at
-- or below Volunteer — inviting someone straight to Staff or Super_Admin stays
-- a Super_Admin action.
create policy invite_links_insert on invite_links for insert to authenticated
  with check (
    public.is_super_admin()
    or (
      created_by = public.current_profile_id()
      and public.leads_all_departments(department_ids)
      and role in ('Member', 'Volunteer')
    )
  );

create policy invite_links_update on invite_links for update to authenticated
  using (public.is_super_admin() or created_by = public.current_profile_id())
  with check (
    public.is_super_admin()
    or (
      created_by = public.current_profile_id()
      and public.leads_all_departments(department_ids)
      and role in ('Member', 'Volunteer')
    )
  );

create policy invite_links_delete on invite_links for delete to authenticated
  using (public.is_super_admin() or created_by = public.current_profile_id());

-- ---------------------------------------------------------------------------
-- 2. Family registration at the check-in desk
-- ---------------------------------------------------------------------------

-- Check-in staff may create people who have no login (children, parents who
-- don't use the app). They may NOT touch anyone with an account, and may not
-- grant privileges — the self-escalation trigger from 0001 still applies.
create policy profiles_checkin_insert on profiles for insert to authenticated
  with check (public.is_checkin_role() and user_id is null);

create policy profiles_checkin_update on profiles for update to authenticated
  using (public.is_checkin_role() and user_id is null)
  with check (public.is_checkin_role() and user_id is null);
