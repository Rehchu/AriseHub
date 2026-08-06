-- AriseHub — church-wide directory, campus-scoped operations.
--
-- Requirement (Pastor/Apostle): people at one campus should be able to see the
-- OTHER campus's DIRECTORY, but NOT its operational data (check-in, rooms,
-- services, medical). Those operational tables are already campus-scoped via
-- same_campus() in 0001 — this migration only opens up the directory itself.
--
-- Also required for messaging: anyone must be able to find people (incl. across
-- departments/campuses) to start a direct message. The old policy limited the
-- directory to check-in roles, which left the DM picker empty for Volunteers.
--
-- What stays protected: profile_medical (Super_Admin / check-in lead only),
-- checkins/rooms/services (campus-scoped), and self-escalation (the before-update
-- trigger still reverts role/campus/is_checkin_lead for non-admins).
--
-- Apply after 0001 (SQL editor or `supabase db push`).

drop policy if exists profiles_select on profiles;
create policy profiles_select on profiles for select to authenticated
  using (true);
