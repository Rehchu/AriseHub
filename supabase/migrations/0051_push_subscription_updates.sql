-- AriseHub — let a device re-register for notifications.
--
-- push_subscriptions has INSERT, SELECT and DELETE policies and no UPDATE one.
-- Both notification screens use `.upsert(...)`, which on conflict performs an
-- UPDATE — so turning notifications back on from a device that had them before
-- was refused by RLS.
--
-- The failure is quiet and looks like the feature is simply broken: the browser
-- permission prompt succeeds, the service worker subscribes, and only the
-- database write fails. Re-subscribing is the normal case, not the edge one —
-- browsers rotate push endpoints, and any reinstall or permission reset lands
-- here.
--
-- Same predicate as the other three: your own row, nobody else's.
--
-- Apply after 0050.

drop policy if exists push_subscriptions_update on push_subscriptions;
create policy push_subscriptions_update on push_subscriptions
  for update to authenticated
  using (profile_id = public.current_profile_id())
  with check (profile_id = public.current_profile_id());
