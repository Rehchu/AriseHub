-- AriseHub — Calendar & facility booking (Phase 5B).
-- Events with room/resource booking, an approval workflow, and conflict
-- detection (enforced in SQL so two approved bookings can't overlap a room).
-- Apply after 0001 (needs campuses, rooms, profiles helpers).

-- Event types the church runs. Seeded with the common ones; staff can add their
-- OWN custom types at any time (that's why this is a table, not an enum).
create table event_types (
  id uuid primary key default gen_random_uuid(),
  name text unique not null,
  color text not null default '#d97706',
  created_at timestamptz not null default now()
);
insert into event_types (name, color) values
  ('Service',        '#d2303b'),
  ('Guest Speaker',  '#7c3aed'),
  ('Camp',           '#059669'),
  ('VBS',            '#0891b2'),
  ('Conference',     '#db2777'),
  ('Outreach',       '#ea580c'),
  ('Youth',          '#2563eb'),
  ('Meeting',        '#4b5563'),
  ('Other',          '#6d6e76');

create table events (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  event_type_id uuid references event_types(id) on delete set null,
  campus_id uuid references campuses(id),
  room_id uuid references rooms(id) on delete set null,
  -- Multi-day support (camps, VBS, conferences run across several days).
  all_day boolean not null default false,
  featured boolean not null default false,   -- pin to "Upcoming Events"
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  -- Setup/teardown buffers (minutes) — included in conflict checks.
  setup_minutes int not null default 0,
  teardown_minutes int not null default 0,
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'declined', 'cancelled')),
  is_public boolean not null default false,   -- shows on the public/iCal feed
  requested_by uuid references profiles(id),
  approved_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint events_time_ck check (ends_at > starts_at)
);
create index events_starts_idx on events(starts_at);
create index events_room_idx on events(room_id, starts_at);
create trigger t_events_upd before update on events
  for each row execute procedure extensions.moddatetime(updated_at);

-- Conflict detection: an APPROVED event may not overlap another APPROVED event
-- in the same room, counting setup/teardown buffers. Raises on insert/update.
create or replace function public.check_event_conflict() returns trigger
  language plpgsql security definer set search_path = public as $$
declare conflict_title text;
begin
  if new.room_id is null or new.status <> 'approved' then
    return new;
  end if;
  select e.title into conflict_title
  from events e
  where e.room_id = new.room_id
    and e.id <> new.id
    and e.status = 'approved'
    and (new.starts_at - make_interval(mins => new.setup_minutes))
        < (e.ends_at + make_interval(mins => e.teardown_minutes))
    and (new.ends_at + make_interval(mins => new.teardown_minutes))
        > (e.starts_at - make_interval(mins => e.setup_minutes))
  limit 1;

  if conflict_title is not null then
    raise exception 'Room is already booked during that time (conflicts with "%")', conflict_title;
  end if;
  return new;
end;
$$;
create trigger t_events_conflict before insert or update on events
  for each row execute procedure public.check_event_conflict();

alter table events enable row level security;
alter table event_types enable row level security;

-- event types: everyone reads; Staff/Super_Admin add custom ones.
create policy event_types_select on event_types for select to authenticated using (true);
create policy event_types_write on event_types for all to authenticated
  using (public.is_staff()) with check (public.is_staff());

-- Everyone authenticated sees the calendar; anyone may REQUEST an event;
-- Staff/Super_Admin approve and manage.
create policy events_select on events for select to authenticated using (true);
create policy events_insert on events for insert to authenticated
  with check (requested_by = public.current_profile_id());
create policy events_update on events for update to authenticated
  using (
    public.is_staff()
    or (requested_by = public.current_profile_id() and status = 'pending')
  )
  with check (
    public.is_staff()
    or (requested_by = public.current_profile_id() and status = 'pending')
  );
create policy events_delete on events for delete to authenticated
  using (public.is_staff() or requested_by = public.current_profile_id());
