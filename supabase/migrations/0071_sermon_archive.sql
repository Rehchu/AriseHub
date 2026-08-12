-- Sermon archive (F5): a searchable record of services that have already
-- happened — the video, what was preached, and the transcript.
--
-- Anchored on service_plans, which is the live spine; the feature doc sketched a
-- separate `services` table that never existed. A sermon can also stand alone
-- (plan_id null) so older messages can be archived without inventing a plan for
-- a Sunday nobody planned in AriseHub.

-- ── Series ──────────────────────────────────────────────────────────────────
create table if not exists public.sermon_series (
  id uuid primary key default gen_random_uuid(),
  campus_id uuid references public.campuses(id),
  name text not null,
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ── Sermons ─────────────────────────────────────────────────────────────────
create table if not exists public.sermons (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid references public.service_plans(id) on delete set null,
  campus_id uuid references public.campuses(id),
  series_id uuid references public.sermon_series(id) on delete set null,
  title text not null,
  -- Two speaker fields on purpose: most messages are preached by someone with a
  -- profile, but guest speakers have no account and still need naming.
  speaker_id uuid references public.profiles(id) on delete set null,
  speaker_name text,
  preached_on date not null default current_date,
  scripture_refs text[] not null default '{}',
  youtube_url text,
  summary text,
  -- Nothing is visible to the congregation until it is deliberately published.
  published boolean not null default false,
  published_at timestamptz,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists sermons_preached_on_idx on public.sermons (preached_on desc);
create index if not exists sermons_series_idx on public.sermons (series_id);
create index if not exists sermons_campus_idx on public.sermons (campus_id);
create index if not exists sermons_published_idx on public.sermons (published, preached_on desc);

-- Free-text search over the things people actually search by. Generated, so it
-- can never drift from the row it describes.
--
-- scripture_refs is deliberately NOT in here: array_to_string is only STABLE,
-- not IMMUTABLE, so Postgres refuses it in a generated column. References are
-- exact tokens anyway ("John 3:16"), better served by the array index below
-- than by stemming them into the same bag of words as prose.
alter table public.sermons
  add column if not exists search_vector tsvector
  generated always as (
    setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(speaker_name, '')), 'B') ||
    setweight(to_tsvector('english', coalesce(summary, '')), 'C')
  ) stored;
create index if not exists sermons_search_idx on public.sermons using gin (search_vector);
create index if not exists sermons_scripture_idx on public.sermons using gin (scripture_refs);

-- ── Transcript ──────────────────────────────────────────────────────────────
-- One row per caption cue, keeping the timings, so a line can be clicked to
-- jump the video to that moment — and so searching finds the exact point in a
-- message rather than just the message.
create table if not exists public.sermon_transcript_cues (
  id uuid primary key default gen_random_uuid(),
  sermon_id uuid not null references public.sermons(id) on delete cascade,
  idx int not null,
  start_seconds numeric(10,3) not null,
  end_seconds numeric(10,3),
  text text not null,
  unique (sermon_id, idx)
);

create index if not exists transcript_cues_sermon_idx
  on public.sermon_transcript_cues (sermon_id, start_seconds);
create index if not exists transcript_cues_search_idx
  on public.sermon_transcript_cues using gin (to_tsvector('english', text));

-- ── Row level security ──────────────────────────────────────────────────────
-- Published sermons are congregation-wide; anything unpublished stays with the
-- people who run services, so a half-finished archive entry is never on show.
alter table public.sermon_series enable row level security;
alter table public.sermons enable row level security;
alter table public.sermon_transcript_cues enable row level security;

drop policy if exists sermon_series_read on public.sermon_series;
create policy sermon_series_read on public.sermon_series
  for select using (auth.uid() is not null);

drop policy if exists sermon_series_write on public.sermon_series;
create policy sermon_series_write on public.sermon_series
  for all using (public.is_services_role()) with check (public.is_services_role());

drop policy if exists sermons_read on public.sermons;
create policy sermons_read on public.sermons
  for select using (published or public.is_services_role());

drop policy if exists sermons_write on public.sermons;
create policy sermons_write on public.sermons
  for all using (public.is_services_role()) with check (public.is_services_role());

drop policy if exists transcript_read on public.sermon_transcript_cues;
create policy transcript_read on public.sermon_transcript_cues
  for select using (
    exists (
      select 1 from public.sermons s
       where s.id = sermon_id
         and (s.published or public.is_services_role())
    )
  );

drop policy if exists transcript_write on public.sermon_transcript_cues;
create policy transcript_write on public.sermon_transcript_cues
  for all using (public.is_services_role()) with check (public.is_services_role());

-- Keep updated_at honest.
drop trigger if exists t_sermons_upd on public.sermons;
create trigger t_sermons_upd before update on public.sermons
  for each row execute procedure extensions.moddatetime(updated_at);
drop trigger if exists t_sermon_series_upd on public.sermon_series;
create trigger t_sermon_series_upd before update on public.sermon_series
  for each row execute procedure extensions.moddatetime(updated_at);

comment on table public.sermons is
  'Archived messages: the video, what was preached, and (via '
  'sermon_transcript_cues) the transcript. Unpublished rows are staff-only.';
comment on table public.sermon_transcript_cues is
  'Caption cues with timings, so transcript lines can seek the video and '
  'searches can land on the exact moment in a message.';
