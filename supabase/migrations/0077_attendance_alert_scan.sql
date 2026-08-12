-- The drop-off scan behind F11.
--
-- Not a report — a flag. "This family attended weekly for two years and hasn't
-- been in five weeks" is the thing nobody notices until it is months late.
--
-- Runs in the database rather than the Worker because it is a single pass over
-- attendance history; pulling that across the wire to count it in JavaScript
-- would be slower and no clearer.
--
-- Two deliberate guards:
--   * min_visits — somebody has to have had a HABIT for stopping to mean
--     anything. A guest who came twice in February is not a drop-off.
--   * the not-exists — an open alert suppresses a new one, so a weekly run
--     cannot re-flag the same family every Sunday until someone calls them.
--     Noise gets ignored, and an ignored alert is worse than none.
create or replace function public.scan_attendance_drop_offs(
  lookback_weeks int default 26,
  min_visits int default 6,
  absent_weeks int default 5
)
returns int
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  flagged int := 0;
begin
  with history as (
    select ga.profile_id,
           count(distinct date_trunc('week', gm.meets_at)) as weeks_present,
           max(gm.meets_at) as last_seen
      from public.group_attendance ga
      join public.group_meetings gm on gm.id = ga.meeting_id
     where ga.present
       and gm.meets_at >= now() - make_interval(weeks => lookback_weeks)
     group by ga.profile_id
  ),
  candidates as (
    select h.profile_id,
           h.last_seen,
           h.weeks_present,
           floor(extract(epoch from (now() - h.last_seen)) / 604800)::int as weeks_absent
      from history h
     where h.weeks_present >= min_visits
       and h.last_seen < now() - make_interval(weeks => absent_weeks)
  )
  insert into public.attendance_alerts (person_id, campus_id, baseline, weeks_absent)
  select c.profile_id,
         p.campus_id,
         case
           when c.weeks_present >= lookback_weeks * 0.8 then 'weekly'
           when c.weeks_present >= lookback_weeks * 0.4 then 'most weeks'
           else 'occasional'
         end,
         c.weeks_absent
    from candidates c
    join public.profiles p on p.id = c.profile_id
   where p.archived_at is null
     and not exists (
       select 1 from public.attendance_alerts a
        where a.person_id = c.profile_id
          and a.status in ('new', 'assigned')
     );

  get diagnostics flagged = row_count;
  return flagged;
end;
$$;

revoke all on function public.scan_attendance_drop_offs(int, int, int) from public;
grant execute on function public.scan_attendance_drop_offs(int, int, int) to authenticated;

comment on function public.scan_attendance_drop_offs(int, int, int) is
  'Flags people who attended regularly and have stopped. Compares each person''s '
  'weeks-present history against how long since they were last seen. Only '
  'considers people with a real habit to break (min_visits), so a one-off '
  'visitor never looks like a drop-off. Never double-flags: an open alert '
  'suppresses a new one.';
