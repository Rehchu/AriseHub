-- The name tag says WHAT the allergy is, not just that one exists.
--
-- "ALLERGY" alone tells a volunteer holding a snack box nothing actionable.
-- Decided 2026-08-09: the details print on the badge (with the existing
-- "Show allergy flag" toggle still able to turn the whole thing off).
--
-- allergy_notes lives in profile_medical, which check-in volunteers cannot
-- read — deliberately (0042: record an allergy, never browse notes). Printing
-- it on the tag changes that calculus: the badge is pinned to the child in a
-- room full of people, so the desk that PRINTS the badge seeing the same text
-- is no wider an exposure. It goes through checkin_people, the existing
-- column-gate for exactly this class of data.

drop view if exists public.checkin_people;

create view public.checkin_people
with (security_barrier = true) as
select
  p.id,
  p.full_name,
  p.campus_id,
  p.photo_url,
  p.photo_path,
  p.is_child,
  p.date_of_birth,
  p.has_allergy,
  pm.allergy_notes,
  p.archived_at
from profiles p
left join profile_medical pm on pm.profile_id = p.id
where public.is_checkin_role();

revoke all on public.checkin_people from anon;
grant select on public.checkin_people to authenticated;

comment on view public.checkin_people is
  'Ages, allergy flags and allergy details for the check-in desk. Gated on '
  'is_checkin_role() — see 0048, and 0067 for why the details joined.';
