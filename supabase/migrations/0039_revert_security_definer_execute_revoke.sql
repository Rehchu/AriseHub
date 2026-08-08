-- AriseHub — revert the EXECUTE revoke from 0038 section 10.
--
-- 0038 revoked EXECUTE on every SECURITY DEFINER helper from PUBLIC, to take
-- them out of the /rest/v1/rpc surface that Supabase's linter flags. It broke
-- the People directory outright:
--
--     select * from people_directory
--     -> ERROR: permission denied for function is_super_admin
--
-- Function EXECUTE is checked against the CALLER, not the view or table owner.
-- people_directory is deliberately not security_invoker, but that only governs
-- TABLE access — its CASE expressions still call can_see_contact_info() as the
-- querying role. The same applies to every RLS policy whose predicate calls a
-- helper.
--
-- The test that justified the revoke was wrong. It checked that a Member could
-- still read their own profiles row afterwards — but profiles_select's USING
-- clause is literally `true` (migration 0004), so no function was ever invoked
-- and the revoke looked harmless. Verifying against a policy that actually
-- calls a helper would have caught it.
--
-- Restoring the default grant returns things exactly to the prior state.
--
-- The underlying finding still stands: ~30 SECURITY DEFINER helpers are
-- callable at /rest/v1/rpc/<name>. The correct fix is to move them into a
-- schema PostgREST does not expose and repoint the policies, which is a code
-- change rather than a grant change.
--
-- Apply after 0038.

do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure as sig
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prosecdef
  loop
    execute format('grant execute on function %s to public', f.sig);
  end loop;
end $$;
