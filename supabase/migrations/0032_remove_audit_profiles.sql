-- Remove the leftover audit/probe person records.
--
-- Deleting an auth user does not delete their profile, which is correct for a
-- church directory: someone can stop having a login and still be a member. It
-- does mean throwaway accounts leave a person record behind, and these three
-- were mine — two audit members and one signup probe.
--
-- Several tables reference profiles, including a DM channel the write-test
-- created, so the dependants go first.

do $$
declare
  victims uuid[];
begin
  select array_agg(id) into victims
  from profiles
  where full_name in ('ZZ Audit One', 'ZZ Audit Two')
     or full_name like 'zz.probe.%'
     or full_name like 'zz.audit%';

  if victims is null then
    raise notice 'No audit profiles found — nothing to do.';
    return;
  end if;

  raise notice 'Removing % audit profile(s).', array_length(victims, 1);

  -- Anything that points at a profile. Ordered so children go before parents.
  delete from messages          where sender_profile_id = any(victims);
  delete from channel_members   where profile_id        = any(victims);
  delete from department_members where profile_id       = any(victims);
  delete from push_subscriptions where profile_id       = any(victims);
  delete from blockout_dates    where profile_id        = any(victims);
  delete from feature_votes     where profile_id        = any(victims);
  delete from feature_requests  where submitted_by      = any(victims);
  delete from plan_assignments  where profile_id        = any(victims);
  delete from group_members     where profile_id        = any(victims);
  delete from care_access       where profile_id        = any(victims);
  delete from person_field_values where profile_id      = any(victims);
  delete from tasks             where assigned_profile_id = any(victims)
                                   or created_by         = any(victims);

  -- Empty DM channels left behind once their only members are gone.
  -- The column is `type` with value 'direct' (0002), not kind/'dm'.
  delete from channels c
  where c.type = 'direct'
    and not exists (select 1 from channel_members m where m.channel_id = c.id);

  delete from profiles where id = any(victims);
end $$;
