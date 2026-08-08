-- AriseHub — let check-in staff actually register a family, and record who a
-- child was released to.
--
-- Two separate problems, both found by running the flow as the roles that use it.
--
-- 1. FAMILY REGISTRATION IS BROKEN FOR EVERYONE WHO USES IT.
--
-- components/checkins/FamilyRegister.tsx is the desk tool for creating parent
-- and child records on a Sunday morning. 0018 added profiles_checkin_insert so
-- check-in staff could create login-less people — but nothing else was opened
-- up. Verified as both Volunteer and Staff:
--
--     create the child/parent profiles   ok
--     create the family                  DENIED  (families_write: Super_Admin)
--     create the guardian pickup links   DENIED  (guardians_write: Super_Admin)
--     save the allergy notes             DENIED  (profile_medical_write)
--
-- The component throws on the first failure, which is step 3 — after it has
-- already created the profiles. So a volunteer registering a family gets an
-- error and leaves orphaned person records behind, every time. This has never
-- worked for anyone other than a Super_Admin.
--
-- profile_medical is the delicate one: 0001 deliberately keeps children's
-- medical details away from general volunteers. That intent is about READING.
-- Registration needs to WRITE what a parent just said at the desk. So INSERT
-- opens to check-in roles while SELECT and UPDATE stay exactly as they were —
-- a volunteer can record an allergy but still cannot browse anyone's notes.
--
-- 2. PICKUP NEVER CHECKED WHO WAS COLLECTING.
--
-- 0001 created `guardians` with can_pickup and the comment "a grandparent may
-- pick up; a non-custodial parent may not". The table is written at
-- registration and then never read again: CheckinStation matched the claim code
-- alone, so whoever held the tag collected the child. The columns below let the
-- station record which authorised guardian took them, or capture a reason when
-- a volunteer releases to somebody who is not on the list.
--
-- Apply after 0041.

-- ---------------------------------------------------------------------------
-- 1. Registration writes
-- ---------------------------------------------------------------------------
drop policy if exists families_write on families;
create policy families_write on families for all to authenticated
  using (public.is_super_admin() or public.is_checkin_role())
  with check (public.is_super_admin() or public.is_checkin_role());

drop policy if exists family_members_write on family_members;
create policy family_members_write on family_members for all to authenticated
  using (public.is_super_admin() or public.is_checkin_role())
  with check (public.is_super_admin() or public.is_checkin_role());

-- Pickup authorisation is created at the desk with the parent standing there.
-- Changing or removing one afterwards stays an admin act — that is the control
-- that decides who may collect a child.
drop policy if exists guardians_write on guardians;
create policy guardians_insert on guardians for insert to authenticated
  with check (public.is_super_admin() or public.is_checkin_role());
create policy guardians_update on guardians for update to authenticated
  using (public.is_super_admin() or public.is_checkin_lead())
  with check (public.is_super_admin() or public.is_checkin_lead());
create policy guardians_delete on guardians for delete to authenticated
  using (public.is_super_admin());

-- Medical: INSERT opens for registration, reading stays gated.
drop policy if exists profile_medical_write on profile_medical;
create policy profile_medical_insert on profile_medical for insert to authenticated
  with check (public.is_super_admin() or public.is_checkin_role());
create policy profile_medical_update on profile_medical for update to authenticated
  using (public.is_super_admin() or public.is_checkin_lead())
  with check (public.is_super_admin() or public.is_checkin_lead());
create policy profile_medical_delete on profile_medical for delete to authenticated
  using (public.is_super_admin());

-- New columns need an explicit grant — 0030 replaced the table-wide one.
grant insert (profile_id, has_allergy, allergy_notes, medical_notes)
  on public.profile_medical to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Record who collected the child
-- ---------------------------------------------------------------------------
alter table checkins
  add column if not exists released_to_profile_id uuid references profiles(id),
  add column if not exists release_note text;

comment on column checkins.released_to_profile_id is
  'The authorised guardian the child was handed to. Null with a release_note '
  'means the volunteer released to somebody not on the pickup list.';
comment on column checkins.release_note is
  'Why a child was released to someone who is not an authorised guardian. '
  'Required by the UI in that case — it is the only record that it happened.';

create index if not exists checkins_released_to_idx
  on public.checkins (released_to_profile_id)
  where released_to_profile_id is not null;
