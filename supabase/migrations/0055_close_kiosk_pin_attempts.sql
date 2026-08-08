-- Same lesson as 0054, the other way round: Supabase's default privileges grant
-- ALL on every newly created public table to anon and authenticated, so
-- kiosk_pin_attempts became a PostgREST endpoint the moment 0053 created it.
--
-- RLS is on with no policies, so it returned zero rows either way — but a
-- brute-force counter should not be reachable at all, and "enable RLS" is not a
-- substitute for "do not grant".
revoke all on public.kiosk_pin_attempts from anon;
revoke all on public.kiosk_pin_attempts from authenticated;
