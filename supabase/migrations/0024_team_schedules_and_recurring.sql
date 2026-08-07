-- AriseHub — team schedule visibility + recurring events.
--
-- 1. A volunteer could previously only see their OWN assignment on a plan, so
--    "who else is serving with me?" was unanswerable. Now anyone on a plan can
--    see the whole team for that plan — which is the point of a rota — while
--    plans they aren't on stay hidden.
--
-- 2. Events repeat. Entering the Sunday service every week is the kind of chore
--    that makes people stop using a calendar.
--
-- Apply after 0023.

-- ---------------------------------------------------------------------------
-- 1. Team visibility on shared plans
-- ---------------------------------------------------------------------------
drop policy if exists plan_assignments_select on plan_assignments;
create policy plan_assignments_select on plan_assignments for select to authenticated
  using (
    public.is_services_role()
    or profile_id = public.current_profile_id()
    -- Anyone scheduled on this plan can see everyone scheduled on it.
    or public.is_on_plan(plan_id)
  );

-- ---------------------------------------------------------------------------
-- 2. Recurring events
-- ---------------------------------------------------------------------------
-- A simple, readable recurrence — weekly/fortnightly/monthly on the event's own
-- weekday. Deliberately not full RRULE: church schedules are regular, and RRULE
-- brings an expansion engine and edge cases nobody here needs.
alter table events add column if not exists repeat_rule text
  check (repeat_rule in ('none', 'weekly', 'fortnightly', 'monthly'));
alter table events add column if not exists repeat_until date;
-- Occurrences generated from a parent event point back at it, so editing or
-- cancelling the series can find them.
alter table events add column if not exists repeat_parent_id uuid
  references events(id) on delete cascade;

create index if not exists events_repeat_parent_idx on events(repeat_parent_id);

update events set repeat_rule = 'none' where repeat_rule is null;
