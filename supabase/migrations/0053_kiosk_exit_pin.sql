-- Tablet lockdown: an exit PIN for the check-in kiosk.
--
-- The tablet in the lobby is signed in as a real account with real check-in
-- access. Kiosk mode already keeps it off the rest of the app by living outside
-- the shell, but the "exit to full AriseHub" link was one tap away and a
-- visitor's child will find it.
--
-- Honest scoping: this is a UI lock, not a privilege boundary. Anyone who can
-- reach the kiosk is already authenticated with check-in rights, so the PIN is
-- there to stop a curious hand, not an attacker — the real boundary is iOS
-- Guided Access / Android Screen Pinning, which the admin panel now tells you
-- to turn on. It is still stored hashed and never sent to the browser, because
-- a PIN people will reuse should not sit in a table anyone can read.

alter table public.checkin_settings
  add column if not exists kiosk_exit_pin_hash text;

-- NOTE: this table's grants turned out to be table-wide ALL, not column-level,
-- so the new column WAS readable by every signed-in account until 0054 narrowed
-- them. Only the SECURITY DEFINER functions below should ever touch it.

-- ---------------------------------------------------------------------------
-- Failed-attempt throttle. A 4-digit PIN is 10,000 guesses, which is nothing
-- for a loop — so count failures per account and stop answering for a while.
create table if not exists public.kiosk_pin_attempts (
  user_id uuid primary key references auth.users(id) on delete cascade,
  failures int not null default 0,
  window_started_at timestamptz not null default now()
);
alter table public.kiosk_pin_attempts enable row level security;
-- No policies, no grants: nothing reaches this table except the definer
-- functions below. An empty-policy RLS table is closed to PostgREST entirely.

-- ---------------------------------------------------------------------------
-- Set or clear the PIN. Super admins only.
create or replace function public.kiosk_set_exit_pin(pin text)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if not public.is_super_admin() then
    raise exception 'Only a super admin can change the kiosk exit PIN';
  end if;

  if pin is null or btrim(pin) = '' then
    update public.checkin_settings set kiosk_exit_pin_hash = null where id;
    return;
  end if;

  if pin !~ '^[0-9]{4,8}$' then
    raise exception 'The kiosk PIN must be 4 to 8 digits';
  end if;

  update public.checkin_settings
     set kiosk_exit_pin_hash = extensions.crypt(pin, extensions.gen_salt('bf', 10))
   where id;
end;
$$;

-- Whether a PIN exists — so the admin screen can say "PIN set" without the
-- hash ever leaving the database.
create or replace function public.kiosk_exit_pin_is_set()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.checkin_settings
     where id and kiosk_exit_pin_hash is not null
  );
$$;

-- Verify. Returns false rather than raising for a wrong PIN, so the caller can
-- say "that's not it" without a Postgres error surfacing in the UI.
create or replace function public.kiosk_check_exit_pin(pin text)
returns boolean
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  stored text;
  uid uuid := auth.uid();
  tries int;
  started timestamptz;
begin
  if uid is null then
    return false;
  end if;

  select kiosk_exit_pin_hash into stored from public.checkin_settings where id;
  -- No PIN configured: nothing to unlock against, so kiosk mode is advisory.
  if stored is null then
    return true;
  end if;

  select failures, window_started_at into tries, started
    from public.kiosk_pin_attempts where user_id = uid;

  -- Fifteen-minute window. Ten wrong guesses and this account stops being
  -- answered until the window rolls over.
  if tries is not null and started > now() - interval '15 minutes' and tries >= 10 then
    raise exception 'Too many incorrect PIN attempts. Try again in a few minutes.';
  end if;

  if stored = extensions.crypt(pin, stored) then
    delete from public.kiosk_pin_attempts where user_id = uid;
    return true;
  end if;

  insert into public.kiosk_pin_attempts (user_id, failures, window_started_at)
       values (uid, 1, now())
  on conflict (user_id) do update
     set failures = case
           when public.kiosk_pin_attempts.window_started_at > now() - interval '15 minutes'
           then public.kiosk_pin_attempts.failures + 1
           else 1
         end,
         window_started_at = case
           when public.kiosk_pin_attempts.window_started_at > now() - interval '15 minutes'
           then public.kiosk_pin_attempts.window_started_at
           else now()
         end;

  -- Slow a scripted loop down without making the real desk wait noticeably.
  perform pg_sleep(0.3);
  return false;
end;
$$;

-- Only signed-in people; anon has no business with any of these.
revoke all on function public.kiosk_set_exit_pin(text) from public, anon;
revoke all on function public.kiosk_exit_pin_is_set() from public, anon;
revoke all on function public.kiosk_check_exit_pin(text) from public, anon;
grant execute on function public.kiosk_set_exit_pin(text) to authenticated;
grant execute on function public.kiosk_exit_pin_is_set() to authenticated;
grant execute on function public.kiosk_check_exit_pin(text) to authenticated;
