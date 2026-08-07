-- AriseHub — department leads can manage the song library.
--
-- Songs were readable by everyone (correct — the whole team needs to see what
-- they're playing) but only writable by Staff/Super_Admin. That blocked the
-- person who actually builds the list: the Praise Team leader.
--
-- Now any department lead can add and edit songs. The library stays shared and
-- church-wide readable, so anything the Praise Team leader adds immediately
-- shows up for every member of the team.
--
-- Apply after 0025.

-- True if the caller leads ANY department. SECURITY DEFINER so the policy
-- doesn't recurse into department_members' own RLS.
create or replace function public.is_any_department_lead() returns boolean
  language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from department_members
    where profile_id = public.current_profile_id() and role = 'lead'
  )
$$;

drop policy if exists songs_write on songs;

-- Add / edit: services staff or any department lead.
create policy songs_insert on songs for insert to authenticated
  with check (public.is_services_role() or public.is_any_department_lead());

create policy songs_update on songs for update to authenticated
  using (public.is_services_role() or public.is_any_department_lead())
  with check (public.is_services_role() or public.is_any_department_lead());

-- Deleting outright is narrower than editing: the UI archives instead, and a
-- hard delete would orphan plan items that reference the song.
create policy songs_delete on songs for delete to authenticated
  using (public.is_services_role());
