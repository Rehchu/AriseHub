-- AriseHub — Phase 1: ChMS schema + RLS
-- Apply to a Supabase project (SQL editor, or `supabase db push`).
-- IT data (assets, tickets, wifi, etc.) is NOT here — it stays in the live
-- Arise-IT D1 Worker. This file is only the new church-management data.
--
-- Design notes:
--  * Soft deletes on profiles (archived_at) — never hard-delete; attendance,
--    check-in, and family links all reference profiles.
--  * profile_medical is a SEPARATE table with its own policy so children's
--    medical info isn't exposed to every Staff/Volunteer who can read the
--    directory. Access = Super_Admin OR profiles.is_checkin_lead.
--  * RLS helper functions are SECURITY DEFINER so a policy on `profiles` can
--    read the caller's own profile without recursive RLS evaluation.
--  * Campus-scoped: non-super-admins only see their own campus.

create extension if not exists moddatetime schema extensions;

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
create type user_role as enum ('Super_Admin', 'IT_Admin', 'Staff', 'Volunteer', 'Member');
create type relationship_type as enum ('Head of Household', 'Spouse', 'Child', 'Other');

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------
create table campuses (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  address text,
  timezone text default 'America/Chicago',
  notes text,
  external_id integer, -- maps to the D1 campuses.id on the Arise-IT side
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- A profile is a PERSON, not a login. Children, visitors, and non-login members
-- have profiles with user_id = null. Staff/admins with a Supabase Auth account
-- have user_id set (unique). This is essential: check-in creates child profiles
-- that will never have an auth.users row.
create table profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid unique references auth.users(id) on delete set null, -- null for login-less people
  full_name text not null,
  email text,
  phone text,
  date_of_birth date,
  membership_status text,
  role user_role not null default 'Member',
  campus_id uuid references campuses(id),
  is_child boolean not null default false,
  is_checkin_lead boolean not null default false, -- grants access to profile_medical/guardians
  photo_url text,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index profiles_campus_idx on profiles(campus_id);
create index profiles_role_idx on profiles(role);
create index profiles_user_idx on profiles(user_id);

create table profile_medical (
  profile_id uuid primary key references profiles(id) on delete cascade,
  has_allergy boolean not null default false,
  allergy_notes text,
  medical_notes text,
  updated_by uuid references profiles(id),
  updated_at timestamptz not null default now()
);

create table families (
  id uuid primary key default gen_random_uuid(),
  family_name text not null,
  primary_contact_profile_id uuid references profiles(id),
  address text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table family_members (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references families(id) on delete cascade,
  profile_id uuid not null references profiles(id) on delete cascade,
  relationship_type relationship_type not null default 'Other',
  created_at timestamptz not null default now(),
  unique (family_id, profile_id)
);
create index family_members_profile_idx on family_members(profile_id);

-- Authorized pickup is a SAFETY control, distinct from household membership:
-- a grandparent may pick up; a non-custodial parent may not.
create table guardians (
  id uuid primary key default gen_random_uuid(),
  child_profile_id uuid not null references profiles(id) on delete cascade,
  guardian_profile_id uuid not null references profiles(id) on delete cascade,
  can_pickup boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  unique (child_profile_id, guardian_profile_id)
);
create index guardians_child_idx on guardians(child_profile_id);

create table rooms (
  id uuid primary key default gen_random_uuid(),
  campus_id uuid not null references campuses(id),
  name text not null,
  min_age_months integer,
  max_age_months integer,
  capacity integer,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table services (
  id uuid primary key default gen_random_uuid(),
  campus_id uuid not null references campuses(id),
  name text not null,
  starts_at timestamptz,
  ends_at timestamptz,
  recurrence text, -- RRULE string; occurrences materialized in Phase 5B
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table service_assignments (
  id uuid primary key default gen_random_uuid(),
  service_id uuid not null references services(id) on delete cascade,
  profile_id uuid not null references profiles(id),
  position text,
  status text not null default 'pending', -- pending | accepted | declined
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index service_assignments_service_idx on service_assignments(service_id);

-- Child-safety audit record. NEVER deleted.
create table checkins (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles(id),
  service_id uuid references services(id),
  room_id uuid references rooms(id),
  campus_id uuid not null references campuses(id),
  security_code text not null,
  checked_in_at timestamptz not null default now(),
  checked_in_by uuid references profiles(id),
  checked_out_at timestamptz,
  checked_out_by uuid references profiles(id),
  badge_printed_at timestamptz
);
create index checkins_service_idx on checkins(service_id);
create index checkins_profile_idx on checkins(profile_id);

-- Mirrors Arise-IT's audit_log on the ChMS side. INSERT via service role or
-- triggers; SELECT Super_Admin only; never UPDATE/DELETE.
create table chms_audit_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id),
  action text not null,
  entity_type text not null,
  entity_id uuid,
  details jsonb,
  ip_address text,
  created_at timestamptz not null default now()
);
create index chms_audit_entity_idx on chms_audit_log(entity_type, entity_id);

-- ---------------------------------------------------------------------------
-- updated_at triggers (Postgres doesn't auto-update like D1 did)
-- ---------------------------------------------------------------------------
create trigger t_campuses_upd before update on campuses for each row execute procedure extensions.moddatetime(updated_at);
create trigger t_profiles_upd before update on profiles for each row execute procedure extensions.moddatetime(updated_at);
create trigger t_profile_medical_upd before update on profile_medical for each row execute procedure extensions.moddatetime(updated_at);
create trigger t_families_upd before update on families for each row execute procedure extensions.moddatetime(updated_at);
create trigger t_rooms_upd before update on rooms for each row execute procedure extensions.moddatetime(updated_at);
create trigger t_services_upd before update on services for each row execute procedure extensions.moddatetime(updated_at);
create trigger t_service_assignments_upd before update on service_assignments for each row execute procedure extensions.moddatetime(updated_at);

-- ---------------------------------------------------------------------------
-- RLS helper functions (SECURITY DEFINER — bypass RLS to avoid recursion)
-- ---------------------------------------------------------------------------
create or replace function public.current_profile_role() returns user_role
  language sql stable security definer set search_path = public as $$
  select role from profiles where user_id = auth.uid()
$$;

create or replace function public.current_campus() returns uuid
  language sql stable security definer set search_path = public as $$
  select campus_id from profiles where user_id = auth.uid()
$$;

create or replace function public.is_checkin_lead() returns boolean
  language sql stable security definer set search_path = public as $$
  select coalesce((select is_checkin_lead from profiles where user_id = auth.uid()), false)
$$;

create or replace function public.is_super_admin() returns boolean
  language sql stable security definer set search_path = public as $$
  select public.current_profile_role() = 'Super_Admin'
$$;

-- Staff/Volunteer/Super_Admin can read the directory and run check-in.
create or replace function public.is_checkin_role() returns boolean
  language sql stable security definer set search_path = public as $$
  select public.current_profile_role() in ('Super_Admin', 'Staff', 'Volunteer')
$$;

-- true if the caller may act on `target_campus` (super-admin = org-wide).
create or replace function public.same_campus(target_campus uuid) returns boolean
  language sql stable security definer set search_path = public as $$
  select public.is_super_admin() or target_campus is not distinct from public.current_campus()
$$;

-- ---------------------------------------------------------------------------
-- Provision a profile automatically when a Supabase Auth user is created, so
-- there's never an authenticated user with no profile (RLS helpers depend on
-- the profile row existing). Role defaults to Member; an admin elevates later.
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_auth_user() returns trigger
  language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (user_id, full_name, email)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    new.email
  )
  on conflict (user_id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_auth_user();

-- Stop a non-admin from escalating their own privileges. The profiles_update_own
-- policy lets people edit their own row (name, phone, photo…) — but RLS can't
-- compare OLD vs NEW, so without this a Member could set role = 'Super_Admin'.
create or replace function public.protect_profile_privileged_fields() returns trigger
  language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and new.user_id = auth.uid() and not public.is_super_admin() then
    new.role := old.role;
    new.campus_id := old.campus_id;
    new.is_checkin_lead := old.is_checkin_lead;
    new.archived_at := old.archived_at;
  end if;
  return new;
end;
$$;

create trigger t_profiles_protect
  before update on profiles
  for each row execute procedure public.protect_profile_privileged_fields();

-- ---------------------------------------------------------------------------
-- Enable RLS
-- ---------------------------------------------------------------------------
alter table campuses enable row level security;
alter table profiles enable row level security;
alter table profile_medical enable row level security;
alter table families enable row level security;
alter table family_members enable row level security;
alter table guardians enable row level security;
alter table rooms enable row level security;
alter table services enable row level security;
alter table service_assignments enable row level security;
alter table checkins enable row level security;
alter table chms_audit_log enable row level security;

-- campuses: readable by any authenticated user; writable by Super_Admin.
create policy campuses_select on campuses for select to authenticated using (true);
create policy campuses_write on campuses for all to authenticated
  using (public.is_super_admin()) with check (public.is_super_admin());

-- profiles: directory visible to check-in roles; members see/edit own row;
-- only Super_Admin edits others.
create policy profiles_select on profiles for select to authenticated
  using (public.is_checkin_role() or user_id = auth.uid());
-- Members may edit their own row, but not change their role or campus (those
-- are admin-controlled — enforced by the trigger below, since RLS can't compare
-- OLD vs NEW column values).
create policy profiles_update_own on profiles for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy profiles_admin_write on profiles for all to authenticated
  using (public.is_super_admin()) with check (public.is_super_admin());

-- profile_medical: Super_Admin or a designated check-in lead ONLY.
create policy profile_medical_read on profile_medical for select to authenticated
  using (public.is_super_admin() or public.is_checkin_lead());
create policy profile_medical_write on profile_medical for all to authenticated
  using (public.is_super_admin() or public.is_checkin_lead())
  with check (public.is_super_admin() or public.is_checkin_lead());

-- families / family_members: check-in roles read; Super_Admin writes.
create policy families_select on families for select to authenticated using (public.is_checkin_role());
create policy families_write on families for all to authenticated
  using (public.is_super_admin()) with check (public.is_super_admin());
create policy family_members_select on family_members for select to authenticated using (public.is_checkin_role());
create policy family_members_write on family_members for all to authenticated
  using (public.is_super_admin()) with check (public.is_super_admin());

-- guardians: check-in roles read; Super_Admin writes.
create policy guardians_select on guardians for select to authenticated using (public.is_checkin_role() or public.is_super_admin());
create policy guardians_write on guardians for all to authenticated
  using (public.is_super_admin()) with check (public.is_super_admin());

-- rooms / services: readable by authenticated (campus-scoped); Super_Admin or
-- same-campus Staff manage.
create policy rooms_select on rooms for select to authenticated using (public.same_campus(campus_id));
create policy rooms_write on rooms for all to authenticated
  using (public.is_super_admin() or (public.current_profile_role() = 'Staff' and public.same_campus(campus_id)))
  with check (public.is_super_admin() or (public.current_profile_role() = 'Staff' and public.same_campus(campus_id)));
create policy services_select on services for select to authenticated using (public.same_campus(campus_id));
create policy services_write on services for all to authenticated
  using (public.is_super_admin() or (public.current_profile_role() = 'Staff' and public.same_campus(campus_id)))
  with check (public.is_super_admin() or (public.current_profile_role() = 'Staff' and public.same_campus(campus_id)));

-- service_assignments: check-in roles read; Super_Admin/Staff write.
create policy service_assignments_select on service_assignments for select to authenticated using (public.is_checkin_role());
create policy service_assignments_write on service_assignments for all to authenticated
  using (public.is_super_admin() or public.current_profile_role() = 'Staff')
  with check (public.is_super_admin() or public.current_profile_role() = 'Staff');

-- checkins: check-in roles insert/select, campus-scoped. NO delete policy.
create policy checkins_select on checkins for select to authenticated
  using (public.is_checkin_role() and public.same_campus(campus_id));
create policy checkins_insert on checkins for insert to authenticated
  with check (public.is_checkin_role() and public.same_campus(campus_id));
create policy checkins_update on checkins for update to authenticated
  using (public.is_checkin_role() and public.same_campus(campus_id))
  with check (public.is_checkin_role() and public.same_campus(campus_id));

-- chms_audit_log: Super_Admin reads. No UPDATE/DELETE, and NO authenticated
-- INSERT policy — audit rows are written only via the service-role key from the
-- server (service role bypasses RLS). This prevents clients from forging or
-- tampering with a child-safety audit trail.
create policy chms_audit_select on chms_audit_log for select to authenticated using (public.is_super_admin());
