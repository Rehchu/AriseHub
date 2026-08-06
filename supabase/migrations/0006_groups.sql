-- AriseHub — Groups, memberships (with roles), meetings, and attendance.
-- Inspired by B1Admin / ChurchCRM group tools. Apply after 0002.
--
-- Model: groups → group_members (role: leader|assistant|member) → group_meetings
--        → group_attendance. Group finder = groups readable church-wide;
-- rosters/meetings/attendance managed by the group's leaders (or Super_Admin).

create table groups (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  group_type text not null default 'small_group'
    check (group_type in ('small_group', 'ministry', 'class', 'other')),
  campus_id uuid references campuses(id),   -- null = church-wide
  meeting_schedule text,                    -- free text, e.g. "Wednesdays 6:30pm"
  is_open boolean not null default true,     -- shows in the group finder / open to join
  created_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger t_groups_upd before update on groups
  for each row execute procedure extensions.moddatetime(updated_at);

create table group_members (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references groups(id) on delete cascade,
  profile_id uuid not null references profiles(id) on delete cascade,
  role text not null default 'member' check (role in ('leader', 'assistant', 'member')),
  joined_at timestamptz not null default now(),
  unique (group_id, profile_id)
);
create index group_members_profile_idx on group_members(profile_id);
create index group_members_group_idx on group_members(group_id);

create table group_meetings (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references groups(id) on delete cascade,
  title text,
  meets_at timestamptz not null default now(),
  notes text,
  created_at timestamptz not null default now()
);
create index group_meetings_group_idx on group_meetings(group_id, meets_at desc);

create table group_attendance (
  id uuid primary key default gen_random_uuid(),
  meeting_id uuid not null references group_meetings(id) on delete cascade,
  profile_id uuid not null references profiles(id) on delete cascade,
  present boolean not null default true,
  created_at timestamptz not null default now(),
  unique (meeting_id, profile_id)
);
create index group_attendance_meeting_idx on group_attendance(meeting_id);

-- Helpers (SECURITY DEFINER → policies don't recurse into the same table).
create or replace function public.is_group_leader(gid uuid) returns boolean
  language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from group_members
    where group_id = gid and profile_id = public.current_profile_id()
      and role in ('leader', 'assistant')
  )
$$;

create or replace function public.is_group_member(gid uuid) returns boolean
  language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from group_members
    where group_id = gid and profile_id = public.current_profile_id()
  )
$$;

-- meeting_id -> group_id, for attendance policies without recursion.
create or replace function public.group_of_meeting(mid uuid) returns uuid
  language sql stable security definer set search_path = public as $$
  select group_id from group_meetings where id = mid
$$;

alter table groups enable row level security;
alter table group_members enable row level security;
alter table group_meetings enable row level security;
alter table group_attendance enable row level security;

-- groups: everyone sees the finder. Create: any authenticated (becomes leader
-- via the app). Manage: Super_Admin or a leader of that group.
create policy groups_select on groups for select to authenticated using (true);
create policy groups_insert on groups for insert to authenticated
  with check (created_by = public.current_profile_id());
create policy groups_update on groups for update to authenticated
  using (public.is_super_admin() or public.is_group_leader(id))
  with check (public.is_super_admin() or public.is_group_leader(id));
create policy groups_delete on groups for delete to authenticated
  using (public.is_super_admin() or public.is_group_leader(id));

-- group_members: rosters visible to authenticated. Manage: Super_Admin or a
-- leader of the group; a person may add/remove THEMSELVES (join/leave open groups).
create policy group_members_select on group_members for select to authenticated using (true);
create policy group_members_insert on group_members for insert to authenticated
  with check (
    public.is_super_admin()
    or public.is_group_leader(group_id)
    or profile_id = public.current_profile_id()
  );
create policy group_members_delete on group_members for delete to authenticated
  using (
    public.is_super_admin()
    or public.is_group_leader(group_id)
    or profile_id = public.current_profile_id()
  );
create policy group_members_update on group_members for update to authenticated
  using (public.is_super_admin() or public.is_group_leader(group_id))
  with check (public.is_super_admin() or public.is_group_leader(group_id));

-- meetings: members see them; leaders (or Super_Admin) manage.
create policy group_meetings_select on group_meetings for select to authenticated
  using (public.is_super_admin() or public.is_group_member(group_id));
create policy group_meetings_write on group_meetings for all to authenticated
  using (public.is_super_admin() or public.is_group_leader(group_id))
  with check (public.is_super_admin() or public.is_group_leader(group_id));

-- attendance: members of the meeting's group can read; leaders record it.
create policy group_attendance_select on group_attendance for select to authenticated
  using (public.is_super_admin() or public.is_group_member(public.group_of_meeting(meeting_id)));
create policy group_attendance_write on group_attendance for all to authenticated
  using (public.is_super_admin() or public.is_group_leader(public.group_of_meeting(meeting_id)))
  with check (public.is_super_admin() or public.is_group_leader(public.group_of_meeting(meeting_id)));
