-- AriseHub — Child & family check-in (Phase 4).
--
-- 0001 created `checkins` and `rooms`. This migration makes the flow usable:
--  * a per-check-in security CODE that matches child badge <-> guardian claim
--  * status (checked_in / checked_out) + who checked them out
--  * room capacity, age range, and an active flag for room auto-assignment
--  * an allergy FLAG on profiles (visual indicator only — the details stay in
--    profile_medical, readable by Super_Admin / check-in leads only)
--
-- Apply after 0001. Badge PRINTING is deliberately not here: iPads can't talk
-- to a DYMO directly, so that needs a print-queue + local agent (later phase).

-- Child badge / guardian claim tag pairing.
alter table checkins add column if not exists security_code text;
alter table checkins add column if not exists status text not null default 'checked_in';
alter table checkins add column if not exists checked_out_at timestamptz;
alter table checkins add column if not exists checked_out_by uuid references profiles(id);
alter table checkins add column if not exists notes text;

create index if not exists checkins_status_idx on checkins(status);
create index if not exists checkins_code_idx on checkins(security_code);

-- Room capacity + age targeting, for auto-assignment and "room full" warnings.
alter table rooms add column if not exists capacity int;
alter table rooms add column if not exists min_age int;
alter table rooms add column if not exists max_age int;
alter table rooms add column if not exists active boolean not null default true;

-- Visual allergy indicator. The actual details live in profile_medical and are
-- NOT readable by general check-in volunteers — this is just a red flag on the
-- badge/roster so a volunteer knows to ask a lead.
alter table profiles add column if not exists has_allergy boolean not null default false;

-- The children's ministry classrooms. Age ranges drive auto-assignment; adjust
-- capacities/ages in Admin later. Attached to the first campus if one exists.
insert into rooms (name, campus_id, min_age, max_age, capacity)
select v.name, (select id from campuses order by created_at limit 1), v.min_age, v.max_age, v.capacity
from (values
  ('Nursery',    0, 2,  15),
  ('Arise Kids', 3, 7,  30),
  ('Super Kids', 8, 12, 30)
) as v(name, min_age, max_age, capacity)
where exists (select 1 from campuses)
  and not exists (select 1 from rooms r where r.name = v.name);

-- Short, unambiguous claim code (no confusable characters).
create or replace function public.generate_security_code() returns text
  language sql volatile as $gen$
  select string_agg(
    substr('ACDEFHJKLMNPRTUVWXY34679', floor(random() * 24 + 1)::int, 1), ''
  )
  from generate_series(1, 4)
$gen$;
