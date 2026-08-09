-- Services follow the department.
--
-- "Praise team only sees praise team stuff." Today is_services_role() is
-- Super_Admin-or-Staff church-wide, so a Staff member in the Children's
-- Department sees the Praise Team's rota, and a Praise Team member who is not
-- Staff sees nothing but the plans they are personally assigned to — they
-- cannot see their own team's schedule.
--
-- Greenfield: zero service_plans, zero plan_assignments. Checked before writing
-- this, which is why it models what the church wants rather than preserving
-- what the policies happen to do today.
--
-- The rule:
--   Super Admin and Admin      — everything, they administer the church
--   a plan WITH a department   — anyone in that department, whatever their role
--   a plan with NO department  — church-wide, so the services roles
--   anyone assigned to a plan  — always, that is their own rota
--
-- Writing additionally requires either a services role or leading the
-- department, so a Praise Team leader can build their own schedule without
-- being made Staff over the whole church.

create or replace function public.is_department_lead(dept uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.department_members dm
     where dm.department_id = dept
       and dm.profile_id = public.current_profile_id()
       and dm.role = 'lead'
  );
$$;

revoke all on function public.is_department_lead(uuid) from public, anon;
grant execute on function public.is_department_lead(uuid) to authenticated;

/** May I see this plan at all? One definition, used by the plan and everything
 *  hanging off it, so a plan's items can never be more visible than the plan. */
create or replace function public.can_see_plan(pid uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
      from public.service_plans sp
     where sp.id = pid
       and (
            public.is_super_admin()
         or public.is_on_plan(sp.id)
         or (sp.department_id is not null and public.is_department_member(sp.department_id))
         or (sp.department_id is null and public.is_services_role())
       )
  );
$$;

create or replace function public.can_edit_plan(pid uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
      from public.service_plans sp
     where sp.id = pid
       and (
            public.is_super_admin()
         or (sp.department_id is not null and public.is_department_lead(sp.department_id))
         or (public.is_services_role()
             and (sp.department_id is null or public.is_department_member(sp.department_id)))
       )
  );
$$;

revoke all on function public.can_see_plan(uuid) from public, anon;
revoke all on function public.can_edit_plan(uuid) from public, anon;
grant execute on function public.can_see_plan(uuid) to authenticated;
grant execute on function public.can_edit_plan(uuid) to authenticated;

-- ---------------------------------------------------------------------------
drop policy if exists service_plans_select on public.service_plans;
create policy service_plans_select on public.service_plans
  for select to authenticated
  using (
       public.is_super_admin()
    or public.is_on_plan(id)
    or (department_id is not null and public.is_department_member(department_id))
    or (department_id is null and public.is_services_role())
  );

-- Split from the old `ALL` policy so INSERT gets a with_check it can actually
-- evaluate: on an insert the row does not exist yet, so can_edit_plan(id) would
-- have nothing to look up.
drop policy if exists service_plans_write on public.service_plans;
create policy service_plans_insert on public.service_plans
  for insert to authenticated
  with check (
       public.is_super_admin()
    or (department_id is not null and public.is_department_lead(department_id))
    or (public.is_services_role()
        and (department_id is null or public.is_department_member(department_id)))
  );
create policy service_plans_update on public.service_plans
  for update to authenticated
  using (public.can_edit_plan(id))
  with check (
       public.is_super_admin()
    or (department_id is not null and public.is_department_lead(department_id))
    or (public.is_services_role()
        and (department_id is null or public.is_department_member(department_id)))
  );
create policy service_plans_delete on public.service_plans
  for delete to authenticated
  using (public.can_edit_plan(id));

-- ---------------------------------------------------------------------------
drop policy if exists plan_items_select on public.plan_items;
create policy plan_items_select on public.plan_items
  for select to authenticated
  using (public.can_see_plan(plan_id));

drop policy if exists plan_items_write on public.plan_items;
create policy plan_items_write on public.plan_items
  for all to authenticated
  using (public.can_edit_plan(plan_id))
  with check (public.can_edit_plan(plan_id));

-- ---------------------------------------------------------------------------
-- Your own assignment stays yours to see and to accept or decline, whatever
-- department the plan belongs to — that is how someone gets asked to serve
-- somewhere new.
drop policy if exists plan_assignments_select on public.plan_assignments;
create policy plan_assignments_select on public.plan_assignments
  for select to authenticated
  using (profile_id = public.current_profile_id() or public.can_see_plan(plan_id));

drop policy if exists plan_assignments_update on public.plan_assignments;
create policy plan_assignments_update on public.plan_assignments
  for update to authenticated
  using (profile_id = public.current_profile_id() or public.can_edit_plan(plan_id))
  with check (profile_id = public.current_profile_id() or public.can_edit_plan(plan_id));

drop policy if exists plan_assignments_delete on public.plan_assignments;
create policy plan_assignments_delete on public.plan_assignments
  for delete to authenticated
  using (public.can_edit_plan(plan_id));

drop policy if exists plan_assignments_insert on public.plan_assignments;
create policy plan_assignments_insert on public.plan_assignments
  for insert to authenticated
  with check (public.can_edit_plan(plan_id));
