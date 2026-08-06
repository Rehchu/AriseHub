-- AriseHub — Web Push subscriptions (for installed-PWA notifications).
-- Each installed device/browser stores one subscription tied to a profile.
-- The server (service role) reads a target's subscriptions to send a push;
-- clients only ever see/manage their own. Apply after 0002.

create table push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles(id) on delete cascade,
  endpoint text unique not null,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now()
);
create index push_subscriptions_profile_idx on push_subscriptions(profile_id);

alter table push_subscriptions enable row level security;

-- A person manages only their own subscriptions. (The send path runs server-side
-- with the service role, which bypasses RLS.)
create policy push_subscriptions_select on push_subscriptions for select to authenticated
  using (profile_id = public.current_profile_id());
create policy push_subscriptions_insert on push_subscriptions for insert to authenticated
  with check (profile_id = public.current_profile_id());
create policy push_subscriptions_delete on push_subscriptions for delete to authenticated
  using (profile_id = public.current_profile_id());
