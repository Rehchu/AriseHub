-- AriseHub — feature requests.
--
-- The people using the app every Sunday know best what it's missing. This gives
-- them somewhere to say so, with voting so the loudest voice isn't automatically
-- the winner.
--
-- Apply after 0024.

create table feature_requests (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  detail text,
  category text not null default 'idea'
    check (category in ('idea', 'improvement', 'problem')),
  status text not null default 'open'
    check (status in ('open', 'planned', 'in_progress', 'done', 'declined')),
  admin_note text,                       -- why it was declined / when it's coming
  submitted_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index feature_requests_status_idx on feature_requests(status, created_at desc);
create trigger t_feature_requests_upd before update on feature_requests
  for each row execute procedure extensions.moddatetime(updated_at);

create table feature_votes (
  request_id uuid not null references feature_requests(id) on delete cascade,
  profile_id uuid not null references profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (request_id, profile_id)
);

alter table feature_requests enable row level security;
alter table feature_votes enable row level security;

-- Everyone can see and submit requests — that's the point.
create policy feature_requests_select on feature_requests
  for select to authenticated using (true);
create policy feature_requests_insert on feature_requests
  for insert to authenticated
  with check (submitted_by = public.current_profile_id());
-- Authors may edit their own while it's still open; admins/IT manage status.
create policy feature_requests_update on feature_requests
  for update to authenticated
  using (
    public.is_super_admin()
    or public.current_profile_role() = 'IT_Admin'
    or (submitted_by = public.current_profile_id() and status = 'open')
  )
  with check (
    public.is_super_admin()
    or public.current_profile_role() = 'IT_Admin'
    or (submitted_by = public.current_profile_id() and status = 'open')
  );
create policy feature_requests_delete on feature_requests
  for delete to authenticated
  using (public.is_super_admin() or submitted_by = public.current_profile_id());

-- One vote each, and you can take it back.
create policy feature_votes_select on feature_votes
  for select to authenticated using (true);
create policy feature_votes_write on feature_votes
  for all to authenticated
  using (profile_id = public.current_profile_id())
  with check (profile_id = public.current_profile_id());
