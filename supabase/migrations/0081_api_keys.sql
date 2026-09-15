-- Personal API keys: let an agent act as one specific person.
--
-- A key is not a new kind of power. It is exchanged (POST /api/agent/token)
-- for an ordinary Supabase session belonging to its owner, so everything the
-- agent does passes through the same RLS policies as that person clicking in
-- the app — and the IT portal accepts the same session and applies its own
-- roles. A key can never do more than its owner, and it loses power the moment
-- its owner does (role change, archival, ban).
--
-- Stored as a SHA-256 hash; the plaintext is shown once at creation and cannot
-- be recovered. Keys carry 256 bits of randomness, so a fast hash is the right
-- tool — slow password hashes exist for secrets a person could guess.

create table if not exists public.api_keys (
  id           uuid primary key default gen_random_uuid(),
  profile_id   uuid not null references public.profiles(id) on delete cascade,
  name         text not null check (char_length(btrim(name)) between 1 and 80),
  -- The first 12 characters ("ahk_" + 8): enough to tell keys apart on the
  -- admin page, useless for signing in.
  prefix       text not null,
  key_hash     text not null unique,
  created_at   timestamptz not null default now(),
  expires_at   timestamptz,
  last_used_at timestamptz,
  last_used_ip text,
  revoked_at   timestamptz
);

create index if not exists api_keys_profile_idx on public.api_keys (profile_id);

alter table public.api_keys enable row level security;

-- Read your own keys. Super_Admin can read everyone's, so a forgotten key on a
-- departed volunteer's account can be found and revoked.
drop policy if exists api_keys_select on public.api_keys;
create policy api_keys_select on public.api_keys for select to authenticated
  using (profile_id = public.current_profile_id() or public.is_super_admin());

-- Deliberately NO insert, update or delete policies. Keys are created and
-- revoked only by server routes that refuse bearer credentials, so a leaked
-- key — or the session it exchanges for — cannot mint more keys, or undo its
-- owner's revocation, by writing to this table over the REST API.

-- The hash never leaves the server, not even to the key's owner.
revoke all on public.api_keys from anon, authenticated;
grant select (id, profile_id, name, prefix, created_at, expires_at,
              last_used_at, last_used_ip, revoked_at)
  on public.api_keys to authenticated;
