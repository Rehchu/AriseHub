-- AriseHub — adult:child ratios, which are the number that actually matters.
--
-- rooms.capacity already warns when a room is full. Capacity is a fire-code
-- number; ratio is the safeguarding one, and it is what insurers, denominational
-- policy and most state licensing rules are written against. A Nursery with 12
-- babies and one adult is well under a capacity of 15 and badly wrong.
--
-- There was no way to know how many adults were in a room. plan_assignments
-- rosters volunteers onto a SERVICE, not into a ROOM, and check-ins are for
-- children. So this adds the smallest thing that answers the question: a count
-- per room per day, set at the station.
--
-- Deliberately a count rather than a roster of who. Naming every adult means
-- somebody maintaining it on a Sunday morning, which means it goes stale, which
-- means the ratio warning lies. A number a volunteer taps takes two seconds and
-- is right.
--
-- Apply after 0045.

alter table rooms
  add column if not exists max_children_per_adult int;

comment on column rooms.max_children_per_adult is
  'Safeguarding ratio. NULL means no ratio is enforced for this room — the '
  'station shows occupancy but no warning.';

-- Sensible starting points by age band, only where nothing is set. These follow
-- the common 1:4 infant / 1:8 preschool / 1:10 school-age shape; adjust in
-- Admin > Rooms to match your own policy.
update rooms set max_children_per_adult = 4
  where max_children_per_adult is null and coalesce(max_age, 99) <= 2;
update rooms set max_children_per_adult = 8
  where max_children_per_adult is null and coalesce(min_age, 0) >= 3 and coalesce(max_age, 99) <= 7;
update rooms set max_children_per_adult = 10
  where max_children_per_adult is null and coalesce(min_age, 0) >= 8;

-- ---------------------------------------------------------------------------
-- How many adults are in the room today
-- ---------------------------------------------------------------------------
create table if not exists room_staffing (
  room_id uuid not null references rooms(id) on delete cascade,
  on_date date not null default current_date,
  adults int not null default 0 check (adults >= 0),
  updated_by uuid references profiles(id),
  updated_at timestamptz not null default now(),
  primary key (room_id, on_date)
);

comment on table room_staffing is
  'Adults present per room per day. Per-day rather than per-service: a room is '
  'staffed for the morning, and asking volunteers to re-count between services '
  'is how the number stops being maintained.';

alter table room_staffing enable row level security;

-- Whoever runs check-in reads and sets it — they are the ones standing there.
create policy room_staffing_select on room_staffing for select to authenticated
  using (public.is_checkin_role());
create policy room_staffing_write on room_staffing for all to authenticated
  using (public.is_checkin_role()) with check (public.is_checkin_role());

create trigger t_room_staffing_upd before update on room_staffing
  for each row execute procedure extensions.moddatetime(updated_at);
