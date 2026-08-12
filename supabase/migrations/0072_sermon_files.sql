-- Slides and attachments for an archived service (F2).
--
-- Files live in R2 (the MEDIA bucket) exactly like message attachments and
-- profile photos; only the key and its metadata are recorded here. R2 objects
-- are private, so /api/files/[...key] behind the session is the only way to
-- read one — a stronger position than a signed URL that keeps working for
-- anyone it is forwarded to.
--
-- A service's printed PDF holds the whole morning: pre-service loop, countdown,
-- announcements, the message, post-service. page_from/page_to record which
-- slice was published as the message, and page_number keeps each rendered slide
-- pinned to its ABSOLUTE page in that PDF, so re-trimming the range later
-- doesn't break anything pointing at a slide.

create table if not exists public.sermon_files (
  id uuid primary key default gen_random_uuid(),
  sermon_id uuid not null references public.sermons(id) on delete cascade,
  kind text not null check (kind in (
    'slides_pdf',    -- the original export, kept as the source of truth
    'slides_pptx',   -- the published deck, built from the selected range
    'slide_image',   -- one rendered page, what the in-app viewer shows
    'proclaim_prs',  -- Proclaim's own backup, so the service stays re-importable
    'handout',
    'other'
  )),
  storage_key text not null,
  filename text,
  content_type text,
  size_bytes bigint,
  page_number int,   -- slide_image: absolute page in the source PDF
  page_count int,    -- slides_pdf: how many pages the export had
  page_from int,     -- published range, inclusive
  page_to int,
  visibility text not null default 'members'
    check (visibility in ('public', 'members', 'staff', 'unlisted')),
  uploaded_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

create index if not exists sermon_files_sermon_idx
  on public.sermon_files (sermon_id, kind, page_number);

alter table public.sermon_files enable row level security;

-- Staff see everything. Everyone else sees a file only when its sermon is
-- published AND the file itself isn't marked staff-only — the original PDF is
-- kept at 'staff' so the raw export (which includes announcements and whatever
-- else was on screen) isn't handed out with the message.
drop policy if exists sermon_files_read on public.sermon_files;
create policy sermon_files_read on public.sermon_files
  for select using (
    public.is_services_role()
    or exists (
      select 1 from public.sermons s
       where s.id = sermon_id
         and s.published
         and sermon_files.visibility <> 'staff'
    )
  );

drop policy if exists sermon_files_write on public.sermon_files;
create policy sermon_files_write on public.sermon_files
  for all using (public.is_services_role()) with check (public.is_services_role());

comment on table public.sermon_files is
  'Slides and attachments for an archived service. Rows point at R2 keys; the '
  'objects themselves are served by /api/files behind the session.';
comment on column public.sermon_files.page_number is
  'For slide_image: the absolute page in the source PDF, so re-trimming the '
  'published range never orphans a slide reference.';
comment on column public.sermon_files.visibility is
  'public is reserved for future unauthenticated sharing; today every read '
  'still goes through the session, so it behaves as members.';
