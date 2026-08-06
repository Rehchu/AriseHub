-- AriseHub — Pastoral care board (visitation / follow-up Kanban).
-- Inspired by ecclesiaCRM's pastoral-care tools. SENSITIVE: visible only to
-- Super_Admin (Pastor & Apostle) and Staff — NOT IT_Admin, Volunteers, Members
-- (except a person can see cards assigned to them). Apply after 0002.

-- true if the caller is on the pastoral-care team (Super_Admin or Staff).
create or replace function public.is_pastoral(  ) returns boolean
  language sql stable security definer set search_path = public as $$
  select public.is_super_admin() or public.current_profile_role() = 'Staff'
$$;

create table care_items (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  about_profile_id uuid references profiles(id) on delete set null, -- who it's about
  about_name text,                          -- free text if not a profile
  category text not null default 'follow_up'
    check (category in ('visitation', 'follow_up', 'prayer', 'benevolence', 'other')),
  stage text not null default 'new'
    check (stage in ('new', 'contacted', 'scheduled', 'resolved')),
  priority text not null default 'normal' check (priority in ('low', 'normal', 'high')),
  assigned_to uuid references profiles(id) on delete set null,
  campus_id uuid references campuses(id),
  notes text,
  created_by uuid references profiles(id),
  due_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index care_items_stage_idx on care_items(stage);
create index care_items_assigned_idx on care_items(assigned_to);
create trigger t_care_items_upd before update on care_items
  for each row execute procedure extensions.moddatetime(updated_at);

alter table care_items enable row level security;

-- Pastoral team sees/manages everything; a person may see cards assigned to them.
create policy care_items_select on care_items for select to authenticated
  using (public.is_pastoral() or assigned_to = public.current_profile_id());
create policy care_items_insert on care_items for insert to authenticated
  with check (public.is_pastoral() and created_by = public.current_profile_id());
create policy care_items_update on care_items for update to authenticated
  using (public.is_pastoral() or assigned_to = public.current_profile_id())
  with check (public.is_pastoral() or assigned_to = public.current_profile_id());
create policy care_items_delete on care_items for delete to authenticated
  using (public.is_pastoral());
