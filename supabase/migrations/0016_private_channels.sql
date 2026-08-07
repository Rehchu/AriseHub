-- AriseHub — private department chats.
--
-- Some conversations must stay closed even to Super_Admin: the Elders chat is
-- readable ONLY by its members (the elders, plus the Apostle and Pastor because
-- they are members of that department). Admin power over the ORGANISATION does
-- not imply the right to read a confidential pastoral conversation.
--
-- messages_select (0002) is already members-only. This migration closes the
-- remaining gaps: channel visibility and member lists.
--
-- Apply after 0002.

alter table departments add column if not exists is_private boolean not null default false;

-- Elders is private by default. Mark others with:
--   update departments set is_private = true where slug = '<slug>';
update departments set is_private = true where slug = 'elders';

-- True if the channel belongs to a private department.
create or replace function public.is_private_channel(cid uuid) returns boolean
  language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from channels c
    join departments d on d.id = c.department_id
    where c.id = cid and d.is_private
  )
$$;

-- channels: Super_Admin may see NON-private channels; private ones are visible
-- only to their members.
drop policy if exists channels_select on channels;
create policy channels_select on channels for select to authenticated
  using (
    public.is_channel_member(id)
    or (public.is_super_admin() and not public.is_private_channel(id))
  );

-- channel_members: same rule — you can't enumerate a private chat's roster
-- unless you're in it.
drop policy if exists channel_members_select on channel_members;
create policy channel_members_select on channel_members for select to authenticated
  using (
    public.is_channel_member(channel_id)
    or (public.is_super_admin() and not public.is_private_channel(channel_id))
  );

-- messages: explicit — members only, no admin bypass (restated for clarity).
drop policy if exists messages_select on messages;
create policy messages_select on messages for select to authenticated
  using (public.is_channel_member(channel_id));
