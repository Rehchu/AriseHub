-- Check-in access follows the department, not just the role.
--
-- The rule the church works to (docs/access-model.md):
--   Super Admin, Admin and Staff can run check-in wherever they serve,
--   plus anyone in a department flagged as running check-in.
--
-- Before: Super_Admin, Staff, Volunteer — church-wide, departments ignored.
-- That was wrong in both directions. Every Praise Team volunteer had access to
-- children's records and never used it; a Children's Department member whose
-- role was only Member did not, and needed it every Sunday.
--
-- 0058 added departments.can_check_in and deliberately enforced nothing, so the
-- flag could be set and checked before anything depended on it. This is the
-- switch. Children's Department, In Edge, Leadership and Volunteers are ticked.
--
-- BLAST RADIUS: one function, fifteen policies. Everything that guards a child's
-- record — checkins, guardians, profile_medical, room_staffing, the
-- checkin_people view, the campus-scoped profile insert — routes through here.
-- That is why it is a function and not fifteen copies of a role list.
--
-- WHO CHANGES TODAY: nobody. Modelled against every account with a login before
-- writing this — all four (two Super_Admins, one Staff in the Children's
-- Department, one IT_Admin with no check-in access before or after) land exactly
-- where they already were. A narrowing change is the dangerous direction, so it
-- goes in when it moves no one, and starts mattering as volunteers are added.

create or replace function public.is_checkin_role()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  -- Elevated roles serve anywhere. Admin is the Apostle/Pastor rung (0059);
  -- Volunteer is deliberately NOT here any more — a volunteer earns check-in
  -- through the department they serve in, which is what the church actually
  -- means by it.
  select public.current_profile_role() in ('Super_Admin', 'Admin', 'Staff')
      or exists (
           select 1
             from public.department_members dm
             join public.departments d on d.id = dm.department_id
            where dm.profile_id = public.current_profile_id()
              and d.can_check_in
         );
$$;

comment on function public.is_checkin_role() is
  'May this person run child check-in? Super_Admin/Admin/Staff anywhere, plus any member of a department with can_check_in. Set per department in Admin > Departments.';
