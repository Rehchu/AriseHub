-- AriseHub — two children present at once must never share a claim code.
--
-- Pickup matched the guardian's tag against the present children and took the
-- FIRST hit (CheckinStation.tsx). Codes were 4 characters from a 24-character
-- alphabet = 331,776 combinations, with no uniqueness anywhere — checkins_code_idx
-- is a plain btree, and there is no constraint. At ~60 children simultaneously
-- checked in that is roughly a 0.5% chance of a collision per service; at 150 it
-- is ~3.4%. Across a year of Sundays it happens, and when it does a volunteer is
-- handed the wrong child's record to release.
--
-- Three changes, only one of which is here:
--   * codes are now 6 characters (191 million combinations) — app side
--   * pickup refuses instead of guessing when two rows match — app side
--   * this index, which makes the collision impossible rather than unlikely
--
-- Partial on purpose. The constraint only binds while a child is present, so
-- codes may repeat freely across past services — checkins rows are never
-- deleted (0001 calls them a child-safety audit record) and would otherwise
-- exhaust the space.
--
-- Verified 0 existing collisions, active or all-time, before creating this.
--
-- Apply after 0039.

create unique index if not exists checkins_active_code_uidx
  on public.checkins (security_code)
  where status = 'checked_in' and security_code is not null;

comment on index public.checkins_active_code_uidx is
  'Guarantees a currently-checked-in child has a unique claim code, so pickup '
  'cannot match the wrong child. The app also generates 6-character codes.';
