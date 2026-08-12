-- When each slide went up in the recording (F5 sync).
--
-- Post-service rather than live: someone plays the video once, tapping as each
-- slide appears. After that every viewer gets slides that advance with the
-- video, and tapping a slide seeks to the moment it went up. The feature doc
-- deliberately defers LIVE follow-along — it needs a dedicated operator and
-- fights stream delay — so this is the version that actually earns its keep.
alter table public.sermon_files
  add column if not exists starts_at_seconds numeric(10,3);

comment on column public.sermon_files.starts_at_seconds is
  'For slide_image: when this slide went up in the recording, so the viewer can '
  'advance slides with the video and a tap on a slide can seek to it. Null '
  'until someone runs the sync editor.';

create index if not exists sermon_files_slide_time_idx
  on public.sermon_files (sermon_id, starts_at_seconds)
  where kind = 'slide_image';
