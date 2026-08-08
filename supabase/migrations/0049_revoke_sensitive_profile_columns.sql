-- AriseHub — the actual revoke. Second half of 0048.
--
-- Apply only AFTER the app is deployed reading `checkin_people` and
-- `people_directory` instead of these columns on `profiles`. 0048 created those
-- paths; this closes the direct one.
--
-- What this stops: any signed-in member running one PostgREST call and getting
-- back every child's exact date of birth and allergy flag, every volunteer's
-- safeguarding status, and the hidden_from_directory flag that made "hidden"
-- service accounts trivially discoverable.
--
-- has_allergy goes too. It is a medical fact about a child, and the check-in
-- roster reads it through checkin_people now rather than through an embed on
-- profiles.
--
-- Not revoked, deliberately: full_name, photo_url, photo_path, title, bio,
-- role, campus_id, is_child, is_checkin_lead, show_birthday, id, user_id,
-- timestamps. Those are the directory, and every embedded profiles(full_name)
-- lookup across groups, tasks, messages and service plans needs them.

revoke select (
  date_of_birth,
  hidden_from_directory,
  background_check_date,
  background_check_expires,
  safeguarding_training_date,
  membership_status,
  elvanto_id,
  has_allergy
) on public.profiles from authenticated;
