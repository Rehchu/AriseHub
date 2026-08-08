-- Private support threads with a department.
--
-- "Anybody can group chat the IT department" — but nobody should see that
-- someone forgot their password. So opening the IT chat does NOT drop you into
-- one shared room. It opens YOUR thread with IT: you see only yours, IT sees
-- all of them.
--
-- Deliberately not a new permission model. A support thread is an ordinary
-- channel whose members are the requester plus the department, so the existing
-- is_channel_member() policies already do the right thing for the requester
-- without a single new rule. The only addition is letting the department see
-- its own threads even when a member joined after a thread was opened.

-- 1. Allow the new channel type.
alter table public.channels drop constraint if exists channels_type_check;
alter table public.channels add constraint channels_type_check
  check (type in ('department', 'direct', 'support'));

-- 2. UNIQUE (department_id) allowed exactly one channel per department, which
--    is right for the department room and fatal for support threads — every
--    thread points at IT. Made partial so the guarantee survives where it
--    matters and support threads are free to share a department.
alter table public.channels drop constraint if exists channels_department_id_key;
create unique index if not exists channels_one_room_per_department
  on public.channels (department_id)
  where type = 'department' and department_id is not null;

-- 3. Who opened it. Lets IT list threads by person, and enforces one thread per
--    person per department so reopening returns the same conversation.
alter table public.channels
  add column if not exists support_requester_profile_id uuid references public.profiles(id) on delete cascade;

create unique index if not exists channels_one_support_thread_per_person
  on public.channels (department_id, support_requester_profile_id)
  where type = 'support';

-- ---------------------------------------------------------------------------
create or replace function public.is_department_member(dept uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.department_members dm
     where dm.department_id = dept
       and dm.profile_id = public.current_profile_id()
  );
$$;

revoke all on function public.is_department_member(uuid) from public, anon;
grant execute on function public.is_department_member(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Open (or reopen) my thread with a department. Returns the channel id.
--
-- SECURITY DEFINER because it has to add the department's members to a channel
-- the caller does not yet belong to — which the caller could not do themselves,
-- and should not be able to.
create or replace function public.get_or_create_support_thread(dept_slug text)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  me uuid := public.current_profile_id();
  dept public.departments%rowtype;
  chan uuid;
begin
  if me is null then
    raise exception 'no profile for this account';
  end if;

  select * into dept from public.departments where slug = dept_slug;
  if dept.id is null then
    raise exception 'no such department: %', dept_slug;
  end if;

  select c.id into chan
    from public.channels c
   where c.type = 'support'
     and c.department_id = dept.id
     and c.support_requester_profile_id = me;

  if chan is null then
    insert into public.channels (type, department_id, title, support_requester_profile_id)
    values ('support', dept.id, dept.name || ' support', me)
    returning id into chan;
  end if;

  -- The requester, plus everyone currently in the department. Re-run on every
  -- open so somebody who joined IT last week appears in older threads too.
  insert into public.channel_members (channel_id, profile_id)
  select chan, me
  on conflict do nothing;

  insert into public.channel_members (channel_id, profile_id)
  select chan, dm.profile_id
    from public.department_members dm
   where dm.department_id = dept.id
  on conflict do nothing;

  return chan;
end;
$$;

revoke all on function public.get_or_create_support_thread(text) from public, anon;
grant execute on function public.get_or_create_support_thread(text) to authenticated;

-- ---------------------------------------------------------------------------
-- The department sees its own threads even if they joined after one was opened.
-- The requester is covered by membership already.
drop policy if exists channels_select on public.channels;
create policy channels_select on public.channels
  for select to authenticated
  using (
    public.is_channel_member(id)
    or (type = 'support' and public.is_department_member(department_id))
    or (public.is_church_admin() and not public.is_private_channel(id))
  );

drop policy if exists messages_select on public.messages;
create policy messages_select on public.messages
  for select to authenticated
  using (
    public.is_channel_member(channel_id)
    or exists (
      select 1 from public.channels c
       where c.id = channel_id
         and c.type = 'support'
         and public.is_department_member(c.department_id)
    )
    or (public.is_church_admin() and not public.is_private_channel(channel_id))
  );

drop policy if exists messages_insert on public.messages;
create policy messages_insert on public.messages
  for insert to authenticated
  with check (
    sender_profile_id = public.current_profile_id()
    and (
      public.is_channel_member(channel_id)
      or exists (
        select 1 from public.channels c
         where c.id = channel_id
           and c.type = 'support'
           and public.is_department_member(c.department_id)
      )
      or (public.is_church_admin() and not public.is_private_channel(channel_id))
    )
  );

drop policy if exists channel_members_select on public.channel_members;
create policy channel_members_select on public.channel_members
  for select to authenticated
  using (
    public.is_channel_member(channel_id)
    or exists (
      select 1 from public.channels c
       where c.id = channel_id
         and c.type = 'support'
         and public.is_department_member(c.department_id)
    )
    or (public.is_church_admin() and not public.is_private_channel(channel_id))
  );
