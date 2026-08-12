-- Maintenance requests (F9): something broken at church.
--
-- The feature doc put this on the Arise-IT side, sharing the IT ticket queue.
-- It is here instead, for one reason: the people who must SEE a request live in
-- this database. Maintenance/Janitorial is already an AriseHub department with
-- membership, and department-scoped visibility is a solved pattern here.
-- Building it in the IT portal would have meant recreating department
-- membership there just to answer "who should see this", and setting up
-- maintenance staff as portal users when they otherwise never touch it.
--
-- The real design constraint came from Bradly: "we also just usually tell them
-- at the church directly." A request form only gets used if it beats walking
-- over and saying it. Hence three fields, and reported_for — so a verbal report
-- can still become a record when someone else types it in.
create or replace function public.is_maintenance() returns boolean
  language sql stable security definer set search_path = public as $$
  select exists (
    select 1
      from public.department_members dm
      join public.departments d on d.id = dm.department_id
     where dm.profile_id = public.current_profile_id()
       and d.slug in ('maintenance-janitorial', 'maintenance')
  )
$$;

create table if not exists public.maintenance_requests (
  id uuid primary key default gen_random_uuid(),
  campus_id uuid references public.campuses(id),
  title text not null,
  -- Free text, not a room reference: "the men's room by the lobby" and "the
  -- north parking lot" are both real answers, and neither is a check-in room.
  location text not null,
  details text,
  photo_key text,
  urgent boolean not null default false,
  status text not null default 'open'
    check (status in ('open', 'in_progress', 'done', 'cancelled')),
  reported_by uuid references public.profiles(id) on delete set null,
  -- Set when somebody logs a request on behalf of the person who mentioned it.
  reported_for text,
  assigned_to uuid references public.profiles(id) on delete set null,
  resolution text,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists maintenance_open_idx
  on public.maintenance_requests (status, created_at desc);
create index if not exists maintenance_assigned_idx
  on public.maintenance_requests (assigned_to)
  where status in ('open', 'in_progress');

alter table public.maintenance_requests enable row level security;

-- Anyone may report; the maintenance team and staff see everything, and a
-- reporter can always see what they sent so it never looks like it vanished.
drop policy if exists maintenance_read on public.maintenance_requests;
create policy maintenance_read on public.maintenance_requests
  for select using (
    public.is_maintenance()
    or public.is_super_admin()
    or public.current_profile_role() = 'Staff'
    or reported_by = public.current_profile_id()
  );

drop policy if exists maintenance_insert on public.maintenance_requests;
create policy maintenance_insert on public.maintenance_requests
  for insert with check (auth.uid() is not null);

drop policy if exists maintenance_update on public.maintenance_requests;
create policy maintenance_update on public.maintenance_requests
  for update using (
    public.is_maintenance() or public.is_super_admin()
  ) with check (
    public.is_maintenance() or public.is_super_admin()
  );

drop trigger if exists t_maintenance_upd on public.maintenance_requests;
create trigger t_maintenance_upd before update on public.maintenance_requests
  for each row execute procedure extensions.moddatetime(updated_at);

comment on table public.maintenance_requests is
  'Something broken at church. Anyone can report; the maintenance department '
  'and staff can see and work them. reported_for carries the name when somebody '
  'logs a request on behalf of a person who mentioned it in passing — which is '
  'how most of these actually arrive.';
