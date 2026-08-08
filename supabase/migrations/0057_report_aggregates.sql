-- Reports silently undercounted once the church passed a thousand people.
--
-- The page fetched every profile row and counted them in JavaScript. PostgREST
-- caps a response at 1000 rows, so "People: 1000" was not a milestone — it was
-- the ceiling, and every role and campus breakdown was wrong with it. The
-- eight-week check-in trend had the same ceiling and would flatten out for the
-- same reason on a busy Sunday.
--
-- Counting belongs in the database. These are SECURITY INVOKER (the default),
-- so RLS still applies exactly as it did to the row fetch: a Staff member
-- aggregates only what they can see, a Super_Admin sees the church.

create or replace function public.report_people_breakdown()
returns table (role public.user_role, campus_id uuid, n bigint)
language sql
stable
set search_path = public
as $$
  select p.role, p.campus_id, count(*)
    from public.profiles p
   where p.archived_at is null
   group by p.role, p.campus_id;
$$;

-- Weekly buckets, Sunday-anchored to match how the page draws them, and in
-- Central time so a Saturday evening does not land in next week (date_trunc's
-- own week starts Monday, hence the +1/-1 shuffle). Returns a row per week with
-- activity; the caller fills the empty ones.
create or replace function public.report_checkins_weekly(p_since timestamptz)
returns table (week date, n bigint)
language sql
stable
set search_path = public
as $$
  select (date_trunc('week', (c.checked_in_at at time zone 'America/Chicago') + interval '1 day') - interval '1 day')::date as week,
         count(*)
    from public.checkins c
   where c.checked_in_at >= p_since
   group by 1
   order by 1;
$$;

create or replace function public.report_new_people_weekly(p_since timestamptz)
returns table (week date, n bigint)
language sql
stable
set search_path = public
as $$
  select (date_trunc('week', (p.created_at at time zone 'America/Chicago') + interval '1 day') - interval '1 day')::date as week,
         count(*)
    from public.profiles p
   where p.created_at >= p_since
   group by 1
   order by 1;
$$;

revoke all on function public.report_people_breakdown() from public, anon;
revoke all on function public.report_checkins_weekly(timestamptz) from public, anon;
revoke all on function public.report_new_people_weekly(timestamptz) from public, anon;
grant execute on function public.report_people_breakdown() to authenticated;
grant execute on function public.report_checkins_weekly(timestamptz) to authenticated;
grant execute on function public.report_new_people_weekly(timestamptz) to authenticated;
