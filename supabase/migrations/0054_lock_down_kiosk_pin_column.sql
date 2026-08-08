-- 0053 added checkin_settings.kiosk_exit_pin_hash on the assumption that this
-- table's grants were column-level, so a new column would start unreadable.
-- They are not: anon and authenticated both hold a table-wide ALL, which covers
-- every column added afterwards. The hash was readable by every signed-in
-- account the moment it was written.
--
-- Same shape of fix as 0048/0049 on profiles: drop the blanket grant, hand back
-- exactly the columns the app names. Every caller already selects explicit
-- columns (admin/checkin/page.tsx, CheckinStation, and the cron route, which
-- uses service_role and keeps its full grant), so nothing loses access.
--
-- `id` is in the SELECT list on purpose. CheckinSettingsAdmin updates with
-- `.eq("id", true)`, and column privileges are checked against WHERE clauses
-- too — leaving it out breaks saving the settings, which is exactly how 0049
-- broke the lapsed-clearance filter.

revoke all on public.checkin_settings from anon;
revoke all on public.checkin_settings from authenticated;

grant select (id, require_pickup_verification, auto_checkout_enabled, updated_at, updated_by)
  on public.checkin_settings to authenticated;
grant update (require_pickup_verification, auto_checkout_enabled, updated_at, updated_by)
  on public.checkin_settings to authenticated;
