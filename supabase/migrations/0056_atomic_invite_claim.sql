-- Invite links could be redeemed more times than they allow.
--
-- /api/join read the link, checked `uses >= max_uses` in JavaScript, created
-- the account, then wrote back `uses + 1`. Two people opening a single-use link
-- at the same time both read uses=0, both passed the check, both got accounts,
-- and both wrote uses=1 — so the link was used twice and still reports once.
-- The increment on its own is a lost update for the same reason.
--
-- A link is a bearer secret with a role attached: "one use" has to mean one.
--
-- claim_invite_link does the check and the increment in a single UPDATE. The
-- WHERE clause is re-evaluated against the freshly locked row, so the second
-- caller sees uses=1 and matches nothing. No row back means "not claimable" —
-- expired, switched off, exhausted, or never existed; the caller keeps its
-- deliberately vague error either way.

create or replace function public.claim_invite_link(p_code text)
returns table (
  id uuid,
  role public.user_role,
  campus_id uuid,
  department_ids uuid[]
)
language sql
security definer
set search_path = public
as $$
  update public.invite_links l
     set uses = l.uses + 1
   where l.code = p_code
     and l.active
     and (l.expires_at is null or l.expires_at > now())
     and (l.max_uses is null or l.uses < l.max_uses)
  returning l.id, l.role, l.campus_id, l.department_ids;
$$;

-- Signup can still fail after the claim (the email already has an account, for
-- instance). Burning a use on a failed attempt is the safe direction, but it is
-- not the right answer, so the route hands it back.
create or replace function public.release_invite_link(p_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.invite_links
     set uses = greatest(uses - 1, 0)
   where id = p_id;
$$;

-- Server-side only. /api/join runs as service_role; nothing in the browser has
-- any business claiming a link, and exposing this to `authenticated` would let
-- any signed-in account burn every outstanding invite in the church.
revoke all on function public.claim_invite_link(text) from public, anon, authenticated;
revoke all on function public.release_invite_link(uuid) from public, anon, authenticated;
grant execute on function public.claim_invite_link(text) to service_role;
grant execute on function public.release_invite_link(uuid) to service_role;
