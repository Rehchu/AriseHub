-- AriseHub — custom fields on people (Phase 5A).
-- Super_Admin defines fields; Staff/Super_Admin set per-person values; a person
-- can read their own values. Apply after 0001.

-- true if the caller is Staff or Super_Admin (people-admin context).
create or replace function public.is_staff() returns boolean
  language sql stable security definer set search_path = public as $$
  select public.is_super_admin() or public.current_profile_role() = 'Staff'
$$;

create table person_fields (
  id uuid primary key default gen_random_uuid(),
  label text not null,
  field_type text not null default 'text'
    check (field_type in ('text', 'number', 'date', 'select', 'checkbox')),
  options jsonb,                             -- for select
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);
create index person_fields_sort_idx on person_fields(sort_order);

create table person_field_values (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles(id) on delete cascade,
  field_id uuid not null references person_fields(id) on delete cascade,
  value text,
  updated_at timestamptz not null default now(),
  unique (profile_id, field_id)
);
create index person_field_values_profile_idx on person_field_values(profile_id);
create trigger t_person_field_values_upd before update on person_field_values
  for each row execute procedure extensions.moddatetime(updated_at);

alter table person_fields enable row level security;
alter table person_field_values enable row level security;

-- field definitions: everyone authenticated can read; Super_Admin manages.
create policy person_fields_select on person_fields for select to authenticated using (true);
create policy person_fields_write on person_fields for all to authenticated
  using (public.is_super_admin()) with check (public.is_super_admin());

-- values: Staff/Super_Admin read all; a person reads their own. Staff writes.
create policy person_field_values_select on person_field_values for select to authenticated
  using (public.is_staff() or profile_id = public.current_profile_id());
create policy person_field_values_write on person_field_values for all to authenticated
  using (public.is_staff()) with check (public.is_staff());
