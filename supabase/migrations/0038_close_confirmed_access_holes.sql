-- AriseHub — close the access-control holes confirmed against production.
--
-- Every item here was reproduced empirically on 2026-08-07 by impersonating the
-- role in question inside a rolled-back transaction, not inferred from reading
-- policy text. Each fix is paired with the observation that motivated it.
--
-- Deliberately NOT in this migration (they need app changes first, so they get
-- their own migration once the code lands):
--   * profiles_select is `using (true)` (from 0004), so every member reads every
--     profile row including children's date_of_birth. Narrowing it breaks every
--     embedded `profiles(full_name)` lookup across groups, tasks and messages.
--   * storage.objects reads are gated on bucket_id alone.
--   * checkins.security_code is 4 chars with no uniqueness (collisions release
--     the wrong child); widening the code is an app change.
--
-- Apply after 0037.

-- ---------------------------------------------------------------------------
-- 1. Invite links: an empty department array satisfied everything
-- ---------------------------------------------------------------------------
-- Observed: leads_all_departments('{}') returns TRUE — `not exists` over zero
-- rows is vacuously true — so Member, Volunteer, Staff and IT_Admin could all
-- insert a link with department_ids='{}', and read the code back through
-- invite_links_select. max_uses and expires_at were unconstrained too, so any
-- member could mint an unlimited, never-expiring self-registration link. That
-- defeats the entire premise of 0017 ("public self-signup stays OFF").
drop policy if exists invite_links_insert on invite_links;
create policy invite_links_insert on invite_links for insert to authenticated
  with check (
    public.is_super_admin()
    or (
      created_by = public.current_profile_id()
      -- A lead must name at least one department, and lead all of them.
      and array_length(department_ids, 1) >= 1
      and public.leads_all_departments(department_ids)
      and role in ('Member', 'Volunteer')
      -- A lead's link cannot outlive a week or be unlimited.
      and max_uses is not null and max_uses between 1 and 100
      and expires_at is not null and expires_at <= now() + interval '7 days'
    )
  );

drop policy if exists invite_links_update on invite_links;
create policy invite_links_update on invite_links for update to authenticated
  using (public.is_super_admin() or created_by = public.current_profile_id())
  with check (
    public.is_super_admin()
    or (
      created_by = public.current_profile_id()
      and array_length(department_ids, 1) >= 1
      and public.leads_all_departments(department_ids)
      and role in ('Member', 'Volunteer')
      and max_uses is not null and max_uses between 1 and 100
      and expires_at is not null and expires_at <= now() + interval '7 days'
    )
  );

-- ---------------------------------------------------------------------------
-- 2. Group takeover
-- ---------------------------------------------------------------------------
-- Observed: a Member (and a Volunteer) could insert themselves into ANY group
-- with role='leader'. is_group_leader() then returns true, which grants
-- groups_update, groups_delete, roster management and the group's meetings and
-- attendance. Joining yourself is fine; choosing your own rank is not.
drop policy if exists group_members_insert on group_members;
create policy group_members_insert on group_members for insert to authenticated
  with check (
    public.is_super_admin()
    or public.is_group_leader(group_id)
    or (profile_id = public.current_profile_id() and role = 'member')
  );

-- ---------------------------------------------------------------------------
-- 3. Unread badges could never clear
-- ---------------------------------------------------------------------------
-- Observed: channel_members has RLS enabled and exactly ONE policy (SELECT), so
-- the app's last_read_at write silently affected 0 rows for everyone, forever.
-- Membership itself stays trigger-managed — this only lets you mark your own
-- row read.
drop policy if exists channel_members_update_own on channel_members;
create policy channel_members_update_own on channel_members for update to authenticated
  using (profile_id = public.current_profile_id())
  with check (profile_id = public.current_profile_id());

-- ---------------------------------------------------------------------------
-- 4. Task reassignment
-- ---------------------------------------------------------------------------
-- 0005's comment says "WITH CHECK keeps the same guard so an assignee can't
-- reassign a task away from themselves". It didn't: the check included
-- `created_by = current_profile_id()`, so an assignee could set created_by to
-- themselves and assigned_profile_id to somebody else in one UPDATE, and the
-- check passed against the new row. Observed working.
--
-- The fix evaluates authorship against the OLD row via a subquery on the
-- table's own primary key, which the WITH CHECK cannot influence.
drop policy if exists tasks_update on tasks;
create policy tasks_update on tasks for update to authenticated
  using (
    public.is_super_admin()
    or created_by = public.current_profile_id()
    or assigned_profile_id = public.current_profile_id()
    or (assigned_department_id is not null and public.is_department_lead(assigned_department_id))
  )
  with check (
    public.is_super_admin()
    -- Authorship is whatever it was before this statement.
    or (select t.created_by from public.tasks t where t.id = tasks.id) = public.current_profile_id()
    or assigned_profile_id = public.current_profile_id()
    or (assigned_department_id is not null and public.is_department_lead(assigned_department_id))
  );

-- ---------------------------------------------------------------------------
-- 5. Privilege escalation by nulling your own user_id
-- ---------------------------------------------------------------------------
-- Observed: a Volunteer or Staff member running
--   update profiles set user_id = null, role = 'Super_Admin' where user_id = <self>
-- became Super_Admin. The guard tested `new.user_id = auth.uid()`; setting
-- new.user_id to null makes that comparison NULL rather than true, so every
-- freeze was skipped. The USING came from profiles_update_own and the WITH
-- CHECK from profiles_checkin_update — permissive policies OR together.
--
-- Two changes: test the OLD row, and freeze user_id itself so identity can't be
-- detached from a profile by its owner.
create or replace function public.protect_profile_privileged_fields() returns trigger
  language plpgsql security definer set search_path = public, pg_temp as $$
begin
  -- OLD, not NEW: the row you are editing is yours based on what it was, not
  -- on what you are trying to make it.
  if auth.uid() is not null and old.user_id = auth.uid() and not public.is_super_admin() then
    new.user_id              := old.user_id;
    new.role                 := old.role;
    new.title                := old.title;
    new.campus_id            := old.campus_id;
    new.is_checkin_lead      := old.is_checkin_lead;
    new.archived_at          := old.archived_at;
    new.hidden_from_directory := old.hidden_from_directory;
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 6. Check-in staff could mint Super_Admin person records
-- ---------------------------------------------------------------------------
-- Observed: a Volunteer could insert a login-less profile with role
-- 'Super_Admin'. The rows are inert today because is_super_admin() keys on
-- user_id, but they poison every role-based query and are one policy change
-- away from being live. The trigger above is BEFORE UPDATE only, so INSERT had
-- no guard at all. Also adds the campus scoping the policy never had.
drop policy if exists profiles_checkin_insert on profiles;
create policy profiles_checkin_insert on profiles for insert to authenticated
  with check (
    public.is_checkin_role()
    and user_id is null
    and role in ('Member', 'Volunteer')
    and public.same_campus(campus_id)
  );

drop policy if exists profiles_checkin_update on profiles;
create policy profiles_checkin_update on profiles for update to authenticated
  using (public.is_checkin_role() and user_id is null and public.same_campus(campus_id))
  with check (
    public.is_checkin_role()
    and user_id is null
    and role in ('Member', 'Volunteer')
    and public.same_campus(campus_id)
  );

-- ---------------------------------------------------------------------------
-- 7. Self-approved public events
-- ---------------------------------------------------------------------------
-- Observed: a Member could insert an event with status='approved' and
-- is_public=true, which lands it on the public iCal feed with no review.
-- Approval is a Staff/Super_Admin act; requesting one is not.
drop policy if exists events_insert on events;
create policy events_insert on events for insert to authenticated
  with check (
    public.is_super_admin()
    or public.current_profile_role() = 'Staff'
    or (
      requested_by = public.current_profile_id()
      and status = 'pending'
      and is_public = false
    )
  );

-- ---------------------------------------------------------------------------
-- 8. The private Elders roster was enumerable
-- ---------------------------------------------------------------------------
-- 0016 locked `channels` and `channel_members` so a private chat's roster could
-- not be listed. It left department_members_select as `using (true)` — and
-- department membership IS channel membership, kept in sync by the 0002
-- trigger. Observed: a plain Member could count the Elders roster.
create or replace function public.is_private_department(dept uuid) returns boolean
  language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce((select is_private from departments where id = dept), false)
$$;

drop policy if exists department_members_select on department_members;
create policy department_members_select on department_members for select to authenticated
  using (
    not public.is_private_department(department_id)
    or profile_id = public.current_profile_id()
    or public.is_department_member(department_id)
  );

-- ---------------------------------------------------------------------------
-- 9. Pin pg_temp on the SECURITY DEFINER helpers
-- ---------------------------------------------------------------------------
-- 31 helpers ran with `set search_path = public`. When pg_temp is not named
-- explicitly Postgres searches it FIRST for tables and types, so a temp object
-- can shadow a real one inside a definer function. Not reachable through
-- PostgREST today (no DDL path), but it is free to close.
do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure as sig
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prosecdef
      and array_to_string(coalesce(p.proconfig, '{}'), ',') like '%search_path=public%'
      and array_to_string(coalesce(p.proconfig, '{}'), ',') not like '%pg_temp%'
  loop
    execute format('alter function %s set search_path = public, pg_temp', f.sig);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 10. Take the RLS helpers out of the public REST API — REVERTED, see 0039
-- ---------------------------------------------------------------------------
-- This section shipped and was immediately reverted by 0039. Kept here with the
-- reasoning intact so the mistake isn't repeated.
--
-- It broke people_directory outright:
--     select * from people_directory
--     -> permission denied for function is_super_admin
--
-- Function EXECUTE is checked against the CALLER. A view that is not
-- security_invoker still evaluates its expressions as the querying role, so
-- revoking EXECUTE from `authenticated` disables every view and RLS predicate
-- that calls a helper.
--
-- The test that justified this was wrong: it exercised profiles_select, whose
-- USING clause is literally `true`, so no function was ever invoked and the
-- revoke looked harmless.
--
-- Doing this properly means moving the helpers into a schema PostgREST does not
-- expose and repointing every policy at it — a code change, not a grant change.
/*  REVERTED — do not re-enable without moving the functions to a private schema.
-- Supabase's linter flags ~30 SECURITY DEFINER functions as callable via
-- /rest/v1/rpc/<name> by anon and authenticated. Verified in a rolled-back
-- transaction that revoking EXECUTE does NOT break the policies that call them
-- — policy evaluation is unaffected; only the public endpoint closes.
--
-- Note EXECUTE is granted to PUBLIC by default, so revoking from anon and
-- authenticated alone changes nothing. PUBLIC has to go too.
--
-- Three functions ARE called as RPCs by the app and must keep working for
-- signed-in users — app/(app)/layout.tsx calls two of them on every page load:
--   get_or_create_dm        PeopleDirectory.tsx:126, NewDialog.tsx:69
--   is_any_department_lead  layout.tsx:49, songs/page.tsx:17, push/send:51
--   is_pastoral             layout.tsx:45, care/page.tsx:18
-- They lose anon access but keep authenticated.
do $$
declare
  f record;
  keep text[] := array['get_or_create_dm', 'is_any_department_lead', 'is_pastoral'];
begin
  for f in
    select p.oid::regprocedure as sig, p.proname
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prosecdef
  loop
    execute format('revoke execute on function %s from public, anon, authenticated', f.sig);
    if f.proname = any(keep) then
      execute format('grant execute on function %s to authenticated', f.sig);
    end if;
  end loop;
end $$;
*/
