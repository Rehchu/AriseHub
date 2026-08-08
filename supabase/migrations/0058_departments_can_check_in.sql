-- Which departments run check-in.
--
-- Check-in access is currently role-based and church-wide: Super_Admin, Staff
-- and Volunteer, from lib/roles.ts and public.is_checkin_role(). That is too
-- broad in one direction and too narrow in the other. A Praise Team volunteer
-- gets check-in and never uses it; a Children's Department member who is only a
-- Member does not get it and needs it every Sunday.
--
-- The rule the church actually works to:
--   Super_Admin, Admin and Staff can run check-in wherever they serve, and
--   anyone in a department that does check-in can run it too.
--
-- A flag rather than a list of slugs, because there are already 17 departments
-- and they add more — 'children-s-department' and 'in-edge' are today's answer,
-- not a permanent one. Praise Team stays off, which is the whole point.
--
-- ADDITIVE ONLY. Nothing reads this column yet; is_checkin_role() is unchanged
-- and every existing grant still applies exactly as before. The enforcement
-- change lands with the wider role work, so this migration cannot lock anyone
-- out of a Sunday morning on its own.

alter table public.departments
  add column if not exists can_check_in boolean not null default false;

comment on column public.departments.can_check_in is
  'Members of this department may run child check-in regardless of their role. Set per department in Admin > Departments.';

update public.departments
   set can_check_in = true
 where slug in ('children-s-department', 'in-edge');

-- Grants on this table are table-wide, so the new column is already readable by
-- `authenticated` and needs no explicit grant. Checked rather than assumed:
-- checkin_settings looked the same and was not (0054).
