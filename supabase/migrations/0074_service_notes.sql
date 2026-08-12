-- Service notes → Media/Production handoff (F1).
--
-- Ministers write what they want on screen; Media reads it and builds the
-- slides in Proclaim. Proclaim stays the presentation tool — this is the
-- handoff surface, not a replacement.
--
-- body is an ordered array of blocks rather than one lump of text:
--   [{ "id": "b1", "text": "…", "slide_worthy": true }]
-- which is what lets a minister mark which lines belong on screen versus which
-- are speaking notes, and what a later diff can be computed against.

create table if not exists public.service_notes (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.service_plans(id) on delete cascade,
  author_id uuid references public.profiles(id) on delete set null,
  campus_id uuid references public.campuses(id),
  title text not null default 'Service notes',
  body jsonb not null default '[]'::jsonb,
  status text not null default 'draft'
    check (status in ('draft', 'submitted', 'in_proclaim', 'done')),
  -- SOFT. Late submissions are flagged, never blocked: the doc is explicit that
  -- sometimes the Spirit gives you things last minute, right up to and through
  -- service time.
  due_at timestamptz,
  submitted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists service_notes_plan_idx on public.service_notes (plan_id);
create index if not exists service_notes_status_idx
  on public.service_notes (status, updated_at desc);

-- Every save keeps the previous body, so Production can see exactly what
-- changed if a minister edits after slides were already built.
create table if not exists public.service_note_revisions (
  id uuid primary key default gen_random_uuid(),
  note_id uuid not null references public.service_notes(id) on delete cascade,
  body jsonb not null,
  saved_by uuid references public.profiles(id) on delete set null,
  saved_at timestamptz not null default now()
);

create index if not exists service_note_revisions_note_idx
  on public.service_note_revisions (note_id, saved_at desc);

alter table public.service_notes enable row level security;
alter table public.service_note_revisions enable row level security;

-- A draft belongs to its author until they submit it. After that anyone who can
-- see the plan can read it — which is how Media gets it without being given
-- blanket access to half-written thoughts.
drop policy if exists service_notes_read on public.service_notes;
create policy service_notes_read on public.service_notes
  for select using (
    public.is_services_role()
    or author_id = public.current_profile_id()
    or (status <> 'draft' and public.can_see_plan(plan_id))
  );

drop policy if exists service_notes_insert on public.service_notes;
create policy service_notes_insert on public.service_notes
  for insert with check (
    public.is_services_role() or author_id = public.current_profile_id()
  );

-- Media advancing the status is an update by someone who is not the author,
-- which is why this is wider than insert.
drop policy if exists service_notes_update on public.service_notes;
create policy service_notes_update on public.service_notes
  for update using (
    public.is_services_role()
    or author_id = public.current_profile_id()
    or (status <> 'draft' and public.can_see_plan(plan_id))
  ) with check (
    public.is_services_role()
    or author_id = public.current_profile_id()
    or (status <> 'draft' and public.can_see_plan(plan_id))
  );

drop policy if exists service_notes_delete on public.service_notes;
create policy service_notes_delete on public.service_notes
  for delete using (
    public.is_services_role() or author_id = public.current_profile_id()
  );

drop policy if exists note_revisions_read on public.service_note_revisions;
create policy note_revisions_read on public.service_note_revisions
  for select using (
    exists (
      select 1 from public.service_notes n
       where n.id = note_id
         and (
           public.is_services_role()
           or n.author_id = public.current_profile_id()
           or (n.status <> 'draft' and public.can_see_plan(n.plan_id))
         )
    )
  );

drop policy if exists note_revisions_write on public.service_note_revisions;
create policy note_revisions_write on public.service_note_revisions
  for insert with check (
    exists (
      select 1 from public.service_notes n
       where n.id = note_id
         and (public.is_services_role() or n.author_id = public.current_profile_id())
    )
  );

drop trigger if exists t_service_notes_upd on public.service_notes;
create trigger t_service_notes_upd before update on public.service_notes
  for each row execute procedure extensions.moddatetime(updated_at);

comment on table public.service_notes is
  'What a minister wants on screen, handed to Media to build in Proclaim. body '
  'is an ordered array of blocks: {id, text, slide_worthy}.';
comment on column public.service_notes.due_at is
  'A SOFT deadline. Late submissions are flagged, never blocked — the doc is '
  'explicit that the Spirit gives things last minute.';
