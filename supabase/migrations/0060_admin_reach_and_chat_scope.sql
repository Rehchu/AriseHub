-- What the Admin rung reaches, and the one place it outranks Super Admin.
--
-- Two separate ideas, deliberately not merged into one helper:
--
--   is_super_admin()  — now Super_Admin OR Admin. "Admin and super admin have
--                       all same controls", so every policy already written
--                       against this one function widens to cover Admin in a
--                       single edit rather than 100. It is a WIDENING: nobody
--                       who could do a thing before loses it, and there are
--                       currently zero accounts with role Admin, so this is a
--                       no-op until someone is assigned.
--
--   is_church_admin() — Admin ONLY. The chat rule below is the one place the
--                       two rungs must differ, so it needs its own predicate.
--
-- Structural/database operations stay Super_Admin-only and are NOT covered by
-- the widening above; they are guarded by their own checks and are listed in
-- docs/access-model.md as still to be split out properly.

create or replace function public.is_church_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles p
     where p.user_id = auth.uid()
       and p.role = 'Admin'
  );
$$;

comment on function public.is_church_admin() is
  'Apostle/Pastor only. Sees and posts in every department chat, which Super_Admin deliberately does not.';

create or replace function public.is_super_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles p
     where p.user_id = auth.uid()
       and p.role in ('Super_Admin', 'Admin')
  );
$$;

revoke all on function public.is_church_admin() from public, anon;
grant execute on function public.is_church_admin() to authenticated;

-- ---------------------------------------------------------------------------
-- Department chats.
--
-- Before: a channel was visible to its members OR to any Super_Admin (as long
-- as it was not a private channel), and messages could only be READ or SENT by
-- members. Two consequences the church asked to change:
--
--   * Bradly and Kristina saw every department's channel and got told about
--     conversations they are not part of. They asked not to.
--   * The Apostle and Pastor could not post in a department chat they were not
--     a member of — the "RLS won't let me send" error. They need every chat.
--
-- After: membership, or the Admin rung. Super_Admin gets no special chat reach.
-- Direct messages stay strictly between their participants for everyone, Admin
-- included — is_private_channel() still gates that.

drop policy if exists channels_select on public.channels;
create policy channels_select on public.channels
  for select to authenticated
  using (
    public.is_channel_member(id)
    or (public.is_church_admin() and not public.is_private_channel(id))
  );

drop policy if exists channel_members_select on public.channel_members;
create policy channel_members_select on public.channel_members
  for select to authenticated
  using (
    public.is_channel_member(channel_id)
    or (public.is_church_admin() and not public.is_private_channel(channel_id))
  );

drop policy if exists messages_select on public.messages;
create policy messages_select on public.messages
  for select to authenticated
  using (
    public.is_channel_member(channel_id)
    or (public.is_church_admin() and not public.is_private_channel(channel_id))
  );

drop policy if exists messages_insert on public.messages;
create policy messages_insert on public.messages
  for insert to authenticated
  with check (
    sender_profile_id = public.current_profile_id()
    and (
      public.is_channel_member(channel_id)
      or (public.is_church_admin() and not public.is_private_channel(channel_id))
    )
  );
