-- AriseHub — make department-head invites actually work.
--
-- 0018 gave department leads permission to issue invite links for departments
-- they lead, at Member or Volunteer. The policy checks
-- `created_by = public.current_profile_id()`, but invite_links.created_by has
-- no default and the UI never set it — so a lead's insert always failed the
-- check. Super_Admins never noticed because they pass on the is_super_admin()
-- branch before created_by is considered.
--
-- Apply after 0033.

alter table invite_links
  alter column created_by set default public.current_profile_id();

comment on column invite_links.created_by is
  'Who issued the link. Defaults to the caller — the RLS policy for department '
  'leads is written against it, so it must never be null.';

-- Backfill so existing links are attributable and editable by their author.
update invite_links
set created_by = (select id from profiles where role = 'Super_Admin' order by created_at limit 1)
where created_by is null;
