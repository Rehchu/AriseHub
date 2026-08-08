-- AriseHub — give chms_audit_log something to record.
--
-- 0001 created the table with real care: Super_Admin reads, no authenticated
-- INSERT policy, no UPDATE, no DELETE, "so clients cannot forge or tamper with
-- a child-safety audit trail". Then nothing ever wrote to it. Verified
-- 2026-08-08: zero rows, and no reference to the table anywhere in the app. A
-- tamper-proof audit trail that records nothing is worse than none, because it
-- looks like a control.
--
-- Written by TRIGGERS rather than from the app, for three reasons:
--   * the app cannot insert — that INSERT policy is deliberately absent, and
--     opening it would let a client forge entries
--   * a trigger cannot be skipped by whoever forgets to call the logger, or by
--     someone going at the REST API directly
--   * SECURITY DEFINER means it writes as the owner, so the missing policy
--     stops clients while the trigger still works
--
-- What is recorded is deliberately narrow: changes to AUTHORITY and to who may
-- collect a child. Ordinary activity already lives in its own tables — checkins
-- is itself the attendance record — and an audit log that captures everything
-- is one nobody reads.
--
-- Apply after 0043.

create or replace function public.audit_write(
  p_action text, p_entity_type text, p_entity_id uuid, p_details jsonb
) returns void
  language plpgsql security definer set search_path = public, pg_temp as $$
begin
  insert into public.chms_audit_log (user_id, action, entity_type, entity_id, details)
  values (public.current_profile_id(), p_action, p_entity_type, p_entity_id, p_details);
end;
$$;

-- ---------------------------------------------------------------------------
-- Who has authority
-- ---------------------------------------------------------------------------
-- role, is_checkin_lead (which unlocks children's medical notes), archival, and
-- hiding someone from the directory. Every one of these is a permission change
-- wearing a different hat.
create or replace function public.audit_profile_privileged() returns trigger
  language plpgsql security definer set search_path = public, pg_temp as $$
declare changed jsonb := '{}'::jsonb;
begin
  if new.role is distinct from old.role then
    changed := changed || jsonb_build_object('role', jsonb_build_array(old.role, new.role));
  end if;
  if new.is_checkin_lead is distinct from old.is_checkin_lead then
    changed := changed || jsonb_build_object('is_checkin_lead',
      jsonb_build_array(old.is_checkin_lead, new.is_checkin_lead));
  end if;
  if new.hidden_from_directory is distinct from old.hidden_from_directory then
    changed := changed || jsonb_build_object('hidden_from_directory',
      jsonb_build_array(old.hidden_from_directory, new.hidden_from_directory));
  end if;
  if (new.archived_at is null) is distinct from (old.archived_at is null) then
    changed := changed || jsonb_build_object('archived',
      jsonb_build_array(old.archived_at is not null, new.archived_at is not null));
  end if;

  if changed <> '{}'::jsonb then
    perform public.audit_write('profile.privileged_change', 'profile', new.id,
      jsonb_build_object('subject', new.full_name, 'changes', changed));
  end if;
  return null;
end;
$$;

drop trigger if exists t_audit_profile_privileged on profiles;
create trigger t_audit_profile_privileged
  after update on profiles
  for each row execute procedure public.audit_profile_privileged();

-- ---------------------------------------------------------------------------
-- Who may collect a child
-- ---------------------------------------------------------------------------
create or replace function public.audit_guardian_change() returns trigger
  language plpgsql security definer set search_path = public, pg_temp as $$
declare
  r record := coalesce(new, old);
  child_name text;
  guardian_name text;
begin
  select full_name into child_name from profiles where id = r.child_profile_id;
  select full_name into guardian_name from profiles where id = r.guardian_profile_id;
  perform public.audit_write(
    'guardian.' || lower(tg_op), 'guardian', r.child_profile_id,
    jsonb_build_object(
      'child', child_name,
      'guardian', guardian_name,
      'can_pickup', case when tg_op = 'DELETE' then null else new.can_pickup end,
      'was_can_pickup', case when tg_op = 'INSERT' then null else old.can_pickup end));
  return null;
end;
$$;

drop trigger if exists t_audit_guardian on guardians;
create trigger t_audit_guardian
  after insert or update or delete on guardians
  for each row execute procedure public.audit_guardian_change();

-- ---------------------------------------------------------------------------
-- A child released to somebody not on the pickup list
-- ---------------------------------------------------------------------------
-- The exception, not the rule. A normal release names an authorised guardian
-- and needs no separate record — the checkins row carries it. This fires when a
-- volunteer overrode that, which is the thing anyone reviewing an incident
-- would go looking for.
create or replace function public.audit_pickup_override() returns trigger
  language plpgsql security definer set search_path = public, pg_temp as $$
declare child_name text;
begin
  if old.status = 'checked_in' and new.status = 'checked_out'
     and new.released_to_profile_id is null
     and coalesce(new.auto_checked_out, false) = false
  then
    select full_name into child_name from profiles where id = new.profile_id;
    perform public.audit_write('checkin.released_without_authorisation', 'checkin', new.id,
      jsonb_build_object('child', child_name, 'note', new.release_note,
                         'security_code', new.security_code));
  end if;
  return null;
end;
$$;

drop trigger if exists t_audit_pickup_override on checkins;
create trigger t_audit_pickup_override
  after update on checkins
  for each row execute procedure public.audit_pickup_override();

-- ---------------------------------------------------------------------------
-- Self-registration links
-- ---------------------------------------------------------------------------
create or replace function public.audit_invite_link() returns trigger
  language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform public.audit_write('invite_link.created', 'invite_link', new.id,
    jsonb_build_object('label', new.label, 'role', new.role,
                       'max_uses', new.max_uses, 'expires_at', new.expires_at));
  return null;
end;
$$;

drop trigger if exists t_audit_invite_link on invite_links;
create trigger t_audit_invite_link
  after insert on invite_links
  for each row execute procedure public.audit_invite_link();

-- ---------------------------------------------------------------------------
-- Reading the log
-- ---------------------------------------------------------------------------
-- chms_audit_select (0001) already limits SELECT to Super_Admin. 0030 replaced
-- the table-wide grant on profiles, so the viewer's join needs the columns it
-- reads; full_name and role are already granted.
create index if not exists chms_audit_created_idx on public.chms_audit_log (created_at desc);
