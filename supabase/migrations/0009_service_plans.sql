-- AriseHub — Service Plans + volunteer scheduling (Phase 5D).
-- Inspired by B1Admin / Planning Center "Plans". Apply after 0002.
--
-- Model: service_plans → plan_items (ordered running sheet) + plan_assignments
--        (volunteer positions with EXPLICIT accept/decline — never auto-assume).
-- Managed by Staff / Super_Admin; assigned volunteers see their plans and
-- accept/decline their OWN assignment.

-- true if the caller runs services (Super_Admin or Staff).
create or replace function public.is_services_role() returns boolean
  language sql stable security definer set search_path = public as $$
  select public.is_super_admin() or public.current_profile_role() = 'Staff'
$$;

create table service_plans (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  service_date date not null default current_date,
  campus_id uuid references campuses(id),
  notes text,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index service_plans_date_idx on service_plans(service_date desc);
create trigger t_service_plans_upd before update on service_plans
  for each row execute procedure extensions.moddatetime(updated_at);

create table plan_items (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references service_plans(id) on delete cascade,
  sort_order int not null default 0,
  title text not null,
  item_type text not null default 'other'
    check (item_type in ('song', 'scripture', 'sermon', 'announcement', 'transition', 'prayer', 'other')),
  duration_minutes int,                      -- drives the running-time total
  notes text,
  created_at timestamptz not null default now()
);
create index plan_items_plan_idx on plan_items(plan_id, sort_order);

create table plan_assignments (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references service_plans(id) on delete cascade,
  position text not null,                    -- e.g. "Acoustic Guitar", "Sound"
  profile_id uuid references profiles(id) on delete set null,
  status text not null default 'invited'
    check (status in ('invited', 'accepted', 'declined')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index plan_assignments_plan_idx on plan_assignments(plan_id);
create index plan_assignments_profile_idx on plan_assignments(profile_id);
create trigger t_plan_assignments_upd before update on plan_assignments
  for each row execute procedure extensions.moddatetime(updated_at);

-- true if caller is scheduled on the plan (SECURITY DEFINER → no recursion).
create or replace function public.is_on_plan(pid uuid) returns boolean
  language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from plan_assignments
    where plan_id = pid and profile_id = public.current_profile_id()
  )
$$;

create or replace function public.plan_of_item(iid uuid) returns uuid
  language sql stable security definer set search_path = public as $$
  select plan_id from plan_items where id = iid
$$;

alter table service_plans enable row level security;
alter table plan_items enable row level security;
alter table plan_assignments enable row level security;

-- plans: services team sees all; a volunteer sees plans they're scheduled on.
create policy service_plans_select on service_plans for select to authenticated
  using (public.is_services_role() or public.is_on_plan(id));
create policy service_plans_write on service_plans for all to authenticated
  using (public.is_services_role()) with check (public.is_services_role());

-- items: visible with the plan; managed by services team.
create policy plan_items_select on plan_items for select to authenticated
  using (public.is_services_role() or public.is_on_plan(plan_id));
create policy plan_items_write on plan_items for all to authenticated
  using (public.is_services_role()) with check (public.is_services_role());

-- assignments: services team sees all; a volunteer sees their own. Services team
-- creates/removes; a volunteer may UPDATE their own row (accept/decline).
create policy plan_assignments_select on plan_assignments for select to authenticated
  using (public.is_services_role() or profile_id = public.current_profile_id());
create policy plan_assignments_insert on plan_assignments for insert to authenticated
  with check (public.is_services_role());
create policy plan_assignments_delete on plan_assignments for delete to authenticated
  using (public.is_services_role());
create policy plan_assignments_update on plan_assignments for update to authenticated
  using (public.is_services_role() or profile_id = public.current_profile_id())
  with check (public.is_services_role() or profile_id = public.current_profile_id());
