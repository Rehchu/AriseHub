-- AriseHub — Phase 2 data: departments, invitations, and messaging
-- (department group chats + direct messages). Apply after 0001.
--
-- Delivers three product requirements:
--  1. Invite different kinds of people (Volunteers, Praise Team, Staff, Elders,
--     Leadership, IT, Media, Creatives, …) by email, with a role + departments.
--  2. A group chat for each department (auto-created; membership follows the
--     department roster).
--  3. Direct messages between any two people.
--
-- Realtime: the frontend subscribes to `messages` (Supabase Realtime) filtered
-- by channel_id. RLS below ensures a subscriber only receives rows for channels
-- they belong to.

-- ---------------------------------------------------------------------------
-- Helper: the caller's profile id (profiles.id, not auth.users id).
-- ---------------------------------------------------------------------------
create or replace function public.current_profile_id() returns uuid
  language sql stable security definer set search_path = public as $$
  select id from profiles where user_id = auth.uid()
$$;

-- ---------------------------------------------------------------------------
-- Departments  (a team/ministry people belong to)
-- ---------------------------------------------------------------------------
create table departments (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text unique not null,
  description text,
  campus_id uuid references campuses(id),   -- null = org-wide
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger t_departments_upd before update on departments
  for each row execute procedure extensions.moddatetime(updated_at);

create table department_members (
  id uuid primary key default gen_random_uuid(),
  department_id uuid not null references departments(id) on delete cascade,
  profile_id uuid not null references profiles(id) on delete cascade,
  role text not null default 'member',      -- member | lead
  created_at timestamptz not null default now(),
  unique (department_id, profile_id)
);
create index department_members_profile_idx on department_members(profile_id);

-- ---------------------------------------------------------------------------
-- Messaging: channels (department group chat OR a direct 1:1), members, messages
-- ---------------------------------------------------------------------------
create table channels (
  id uuid primary key default gen_random_uuid(),
  type text not null check (type in ('department', 'direct')),
  department_id uuid unique references departments(id) on delete cascade, -- set iff type='department'
  title text,                               -- department name; null for direct
  created_at timestamptz not null default now()
);

create table channel_members (
  id uuid primary key default gen_random_uuid(),
  channel_id uuid not null references channels(id) on delete cascade,
  profile_id uuid not null references profiles(id) on delete cascade,
  last_read_at timestamptz,                 -- for unread counts
  created_at timestamptz not null default now(),
  unique (channel_id, profile_id)
);
create index channel_members_profile_idx on channel_members(profile_id);

create table messages (
  id uuid primary key default gen_random_uuid(),
  channel_id uuid not null references channels(id) on delete cascade,
  sender_profile_id uuid not null references profiles(id),
  body text not null,
  created_at timestamptz not null default now(),
  edited_at timestamptz,
  deleted_at timestamptz                    -- soft delete
);
create index messages_channel_idx on messages(channel_id, created_at desc);

-- true if the caller belongs to a channel (SECURITY DEFINER to avoid RLS recursion)
create or replace function public.is_channel_member(cid uuid) returns boolean
  language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from channel_members
    where channel_id = cid and profile_id = public.current_profile_id()
  )
$$;

-- ---------------------------------------------------------------------------
-- Triggers: department roster drives the group chat automatically
-- ---------------------------------------------------------------------------
-- Creating a department creates its group-chat channel.
create or replace function public.create_department_channel() returns trigger
  language plpgsql security definer set search_path = public as $$
begin
  insert into channels (type, department_id, title) values ('department', new.id, new.name);
  return new;
end;
$$;
create trigger t_department_channel after insert on departments
  for each row execute procedure public.create_department_channel();

-- Keep the channel title in sync if the department is renamed.
create or replace function public.sync_department_channel_title() returns trigger
  language plpgsql security definer set search_path = public as $$
begin
  if new.name is distinct from old.name then
    update channels set title = new.name where department_id = new.id;
  end if;
  return new;
end;
$$;
create trigger t_department_channel_title after update on departments
  for each row execute procedure public.sync_department_channel_title();

-- Joining a department adds you to its group chat; leaving removes you.
create or replace function public.sync_department_channel_membership() returns trigger
  language plpgsql security definer set search_path = public as $$
declare cid uuid;
begin
  if tg_op = 'INSERT' then
    select id into cid from channels where department_id = new.department_id;
    if cid is not null then
      insert into channel_members (channel_id, profile_id) values (cid, new.profile_id)
      on conflict (channel_id, profile_id) do nothing;
    end if;
    return new;
  elsif tg_op = 'DELETE' then
    select id into cid from channels where department_id = old.department_id;
    if cid is not null then
      delete from channel_members where channel_id = cid and profile_id = old.profile_id;
    end if;
    return old;
  end if;
  return null;
end;
$$;
create trigger t_department_member_channel
  after insert or delete on department_members
  for each row execute procedure public.sync_department_channel_membership();

-- Find (or create) the direct-message channel between the caller and `other`.
-- Returns the channel id. SECURITY DEFINER so it can create the channel + both
-- memberships regardless of RLS.
create or replace function public.get_or_create_dm(other_profile uuid) returns uuid
  language plpgsql security definer set search_path = public as $$
declare me uuid := public.current_profile_id();
declare cid uuid;
begin
  if me is null or other_profile is null or me = other_profile then
    raise exception 'invalid direct-message participants';
  end if;
  -- an existing direct channel whose members are exactly {me, other}
  select c.id into cid
  from channels c
  where c.type = 'direct'
    and (select count(*) from channel_members m where m.channel_id = c.id) = 2
    and exists (select 1 from channel_members m where m.channel_id = c.id and m.profile_id = me)
    and exists (select 1 from channel_members m where m.channel_id = c.id and m.profile_id = other_profile)
  limit 1;

  if cid is null then
    insert into channels (type) values ('direct') returning id into cid;
    insert into channel_members (channel_id, profile_id) values (cid, me), (cid, other_profile);
  end if;
  return cid;
end;
$$;

-- ---------------------------------------------------------------------------
-- Invitations: invite by email with a role + departments. On signup, the
-- profile auto-adopts the invite's role/campus and department memberships.
-- ---------------------------------------------------------------------------
create table invitations (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  role user_role not null default 'Member',
  campus_id uuid references campuses(id),
  token text unique not null,               -- opaque link token (issued by the app)
  invited_by uuid references profiles(id),
  status text not null default 'pending',   -- pending | accepted | revoked
  expires_at timestamptz not null default (now() + interval '14 days'),
  accepted_at timestamptz,
  created_at timestamptz not null default now()
);
create index invitations_email_idx on invitations(lower(email));

create table invitation_departments (
  invitation_id uuid not null references invitations(id) on delete cascade,
  department_id uuid not null references departments(id) on delete cascade,
  primary key (invitation_id, department_id)
);

-- Extend the signup handler (from 0001) to consume a pending invitation matching
-- the new user's email: adopt role + campus, join departments (which the trigger
-- above turns into group-chat memberships), and mark the invite accepted.
create or replace function public.handle_new_auth_user() returns trigger
  language plpgsql security definer set search_path = public as $$
declare new_profile_id uuid;
declare inv record;
begin
  insert into public.profiles (user_id, full_name, email)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    new.email
  )
  on conflict (user_id) do nothing
  returning id into new_profile_id;

  if new_profile_id is null then
    select id into new_profile_id from public.profiles where user_id = new.id;
  end if;

  select * into inv from public.invitations
  where lower(email) = lower(new.email) and status = 'pending' and expires_at > now()
  order by created_at desc limit 1;

  if inv.id is not null then
    update public.profiles set role = inv.role, campus_id = coalesce(inv.campus_id, campus_id)
    where id = new_profile_id;

    insert into public.department_members (department_id, profile_id)
    select d.department_id, new_profile_id from public.invitation_departments d
    where d.invitation_id = inv.id
    on conflict (department_id, profile_id) do nothing;

    update public.invitations set status = 'accepted', accepted_at = now() where id = inv.id;
  end if;

  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Seed the church's known departments (org-wide; reassign to a campus later).
-- Each insert fires the trigger that creates its group-chat channel.
-- ---------------------------------------------------------------------------
insert into departments (name, slug, description) values
  ('Leadership',    'leadership',   'Elders and senior leadership'),
  ('Elders',        'elders',       'Board of elders'),
  ('Staff',         'staff',        'Church staff'),
  ('IT Department', 'it',           'Information technology'),
  ('Praise Team',   'praise-team',  'Worship and music'),
  ('Media Team',    'media',        'Livestream, audio/visual, slides'),
  ('Creatives',     'creatives',    'Design, content, and creative arts'),
  ('Volunteers',    'volunteers',   'General volunteers');

-- true if the caller is a 'lead' of the given department (SECURITY DEFINER so the
-- RLS policy on department_members doesn't query itself → no recursion).
create or replace function public.is_department_lead(dept uuid) returns boolean
  language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from department_members
    where department_id = dept and profile_id = public.current_profile_id() and role = 'lead'
  )
$$;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table departments enable row level security;
alter table department_members enable row level security;
alter table channels enable row level security;
alter table channel_members enable row level security;
alter table messages enable row level security;
alter table invitations enable row level security;
alter table invitation_departments enable row level security;

-- departments: everyone authenticated sees the list; Super_Admin manages.
create policy departments_select on departments for select to authenticated using (true);
create policy departments_write on departments for all to authenticated
  using (public.is_super_admin()) with check (public.is_super_admin());

-- department_members: authenticated can see rosters; Super_Admin (or a lead of
-- that department) manages membership.
create policy department_members_select on department_members for select to authenticated using (true);
create policy department_members_write on department_members for all to authenticated
  using (public.is_super_admin() or public.is_department_lead(department_id))
  with check (public.is_super_admin() or public.is_department_lead(department_id));

-- channels: visible to members (Super_Admin sees all). No client writes — channels
-- are created by triggers (department) or get_or_create_dm() (direct).
create policy channels_select on channels for select to authenticated
  using (public.is_super_admin() or public.is_channel_member(id));

-- channel_members: a member can see who else is in their channels.
create policy channel_members_select on channel_members for select to authenticated
  using (public.is_super_admin() or public.is_channel_member(channel_id));

-- messages: read/post only in channels you belong to; edit/delete only your own.
create policy messages_select on messages for select to authenticated
  using (public.is_channel_member(channel_id));
create policy messages_insert on messages for insert to authenticated
  with check (public.is_channel_member(channel_id) and sender_profile_id = public.current_profile_id());
create policy messages_update_own on messages for update to authenticated
  using (sender_profile_id = public.current_profile_id())
  with check (sender_profile_id = public.current_profile_id());

-- invitations: Super_Admin only (create/read/manage). Acceptance happens server-
-- side via the signup trigger, not a client write.
create policy invitations_admin on invitations for all to authenticated
  using (public.is_super_admin()) with check (public.is_super_admin());
create policy invitation_departments_admin on invitation_departments for all to authenticated
  using (public.is_super_admin()) with check (public.is_super_admin());
