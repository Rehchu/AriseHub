-- AriseHub — department-scoped schedules + person photos.
--
-- 1. Service plans gain a department, so the scheduling calendar can show
--    "Media's schedule" rather than everything at once.
-- 2. Check-in staff can save photos on the people they register (children and
--    parents). A photo on the badge is a real child-safety win at pickup.
--
-- Apply after 0020.

alter table service_plans add column if not exists department_id uuid
  references departments(id) on delete set null;
create index if not exists service_plans_department_idx
  on service_plans(department_id, service_date desc);

-- photo_url already exists on profiles (0001). Photos are stored in Supabase
-- Storage; this records which bucket object belongs to whom so it can be
-- cleaned up if the person is removed.
alter table profiles add column if not exists photo_path text;
