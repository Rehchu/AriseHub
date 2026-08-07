-- AriseHub — actually enforce the contact-column restriction.
--
-- 0029 ran `revoke select (email, phone, …) on profiles from authenticated`
-- and changed nothing: in Postgres a table-level GRANT SELECT implies every
-- column, and a column-level REVOKE cannot carve a hole out of it. Verified
-- against the live database with a real member session — all six columns were
-- still readable afterwards.
--
-- The working form is the inverse: drop the table-wide grant, then grant back
-- only the columns members are allowed to read. Contact details are then
-- reachable exclusively through people_directory, which gates them.
--
-- date_of_birth stays granted: /checkins and /kiosk read it to pick an
-- age-appropriate room, and those queries run as the signed-in user. Moving
-- them onto the view is worth doing, but it is a behaviour change that needs
-- testing with a real check-in volunteer, not a privilege tweak.
--
-- service_role is untouched, so the reminder cron still reads emails.
--
-- Apply after 0029.

revoke select on public.profiles from authenticated;
revoke select on public.profiles from anon;

grant select (
  id,
  user_id,
  full_name,
  membership_status,
  role,
  campus_id,
  is_child,
  is_checkin_lead,
  photo_url,
  archived_at,
  created_at,
  updated_at,
  has_allergy,
  elvanto_id,
  photo_path,
  title,
  bio,
  date_of_birth
) on public.profiles to authenticated;

-- Not granted, and that is the point:
--   email, phone, birthday, address, emergency_contact, emergency_phone
-- Those are readable only via public.people_directory (0029), which returns
-- them when can_see_contact_info() is true or the row is your own.
