-- AriseHub — song library.
--
-- Phase 5E was cut because CCLI removed its public developer API. Elvanto's
-- songs endpoint reopens it: songs sync in from Elvanto, and service plan items
-- can reference a real song instead of free text.
--
-- Songs are also creatable by hand, so the Praise Team isn't blocked on the
-- Elvanto key being configured.
--
-- Apply after 0022.

create table songs (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  artist text,
  ccli_number text,
  default_key text,
  bpm int,
  duration_seconds int,
  themes text[] not null default '{}',
  notes text,
  chart_url text,          -- link to a chart/lyrics doc the team already uses
  elvanto_id text unique,  -- null for songs added by hand
  archived boolean not null default false,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index songs_title_idx on songs(title);
create trigger t_songs_upd before update on songs
  for each row execute procedure extensions.moddatetime(updated_at);

-- Plan items can point at a song. Free-text items still work — the title is
-- kept on the item so a plan reads correctly even if a song is later removed.
alter table plan_items add column if not exists song_id uuid
  references songs(id) on delete set null;
alter table plan_items add column if not exists song_key text;

alter table songs enable row level security;

-- Everyone authenticated can read the library (volunteers need to see what
-- they're playing); services staff maintain it.
create policy songs_select on songs for select to authenticated using (true);
create policy songs_write on songs for all to authenticated
  using (public.is_services_role()) with check (public.is_services_role());
