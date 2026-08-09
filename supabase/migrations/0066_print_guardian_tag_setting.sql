-- One name tag, not two.
--
-- "Also print guardian pickup tag" lived in localStorage, per device, defaulting
-- to on. So two tablets in the same foyer could disagree about how many labels a
-- check-in produces, and nobody could tell which was right. Worse, the kiosk no
-- longer renders the name tag panel (it belongs to the staffed desk), so a kiosk
-- tablet had no way to change it at all.
--
-- Church-wide, set once in Admin -> Check-in, like require_pickup_verification.
--
-- Defaults to FALSE. The child's pickup code is printed on the child's own tag
-- either way, so the guardian slip is a convenience, not part of the check —
-- and printing two labels per child burns a roll twice as fast.

alter table public.checkin_settings
  add column if not exists print_guardian_tag boolean not null default false;

comment on column public.checkin_settings.print_guardian_tag is
  'When true a check-in prints a second label for the guardian to keep. The '
  'child''s pickup code appears on their own tag regardless, so this is a '
  'convenience rather than part of the pickup check.';

-- 0054 revoked table-wide access and granted specific columns, so a new column
-- is invisible and unwritable to authenticated until it is granted explicitly.
grant select (print_guardian_tag) on public.checkin_settings to authenticated;
grant update (print_guardian_tag) on public.checkin_settings to authenticated;
