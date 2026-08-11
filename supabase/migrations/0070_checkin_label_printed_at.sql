-- Track whether a check-in's badge has been printed, so a print station can
-- auto-print new check-ins (from self-service tablets) exactly once.
alter table public.checkins add column if not exists label_printed_at timestamptz;

-- Everything that already exists counts as printed — otherwise the first time a
-- station turns on auto-print it would print a badge for every child already
-- checked in and sitting in their room.
update public.checkins set label_printed_at = checked_in_at where label_printed_at is null;

comment on column public.checkins.label_printed_at is
  'When this check-in''s name tag was printed. NULL means it still needs a '
  'badge — a print station polls for these and prints them once.';

create index if not exists checkins_unprinted_idx
  on public.checkins (checked_in_at)
  where label_printed_at is null and status = 'checked_in';
