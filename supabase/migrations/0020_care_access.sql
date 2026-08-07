-- AriseHub — restrict Pastoral Care to the Apostle and Pastor.
--
-- Care notes are the most sensitive data in the system. Previously any Staff
-- member could read the board; now access is limited to Super_Admin (the
-- Apostle and Pastor) plus anyone THEY have explicitly granted — and only they
-- can grant it. Being Staff, IT_Admin, or a department lead grants nothing.
--
-- Apply after 0008.

create table care_access (
  profile_id uuid primary key references profiles(id) on delete cascade,
  granted_by uuid references profiles(id),
  granted_at timestamptz not null default now(),
  note text
);

alter table care_access enable row level security;

-- Only Super_Admin may see or change who has care access.
create policy care_access_admin on care_access
  for all to authenticated
  using (public.is_super_admin())
  with check (public.is_super_admin());

-- Redefined: Super_Admin, or someone explicitly granted access.
-- SECURITY DEFINER so the care_access lookup isn't blocked by its own policy.
create or replace function public.is_pastoral() returns boolean
  language sql stable security definer set search_path = public as $$
  select public.is_super_admin() or exists (
    select 1 from care_access where profile_id = public.current_profile_id()
  )
$$;

-- Tighten the insert policy: creating a care item now requires care access,
-- not merely Staff.
drop policy if exists care_items_insert on care_items;
create policy care_items_insert on care_items for insert to authenticated
  with check (public.is_pastoral() and created_by = public.current_profile_id());
