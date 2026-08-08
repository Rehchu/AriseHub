-- Church branding, stored once.
--
-- The flame mark goes on every badge, and until now the only way to get it onto
-- one was "+ Image" and finding the file again each time — for every template,
-- on every device. Upload it once, reuse it everywhere.
--
-- Stored as a data URL, matching how the designer already inlines images into
-- the design jsonb. That keeps rendering entirely client-side: no signed URL to
-- expire, no fetch to fail while a queue waits at the check-in desk. The 400KB
-- cap the designer enforces on uploads applies here too, and a label prints at
-- 300dpi so a small mark is plenty.
--
-- Single row, same shape as checkin_settings: `id boolean primary key default
-- true` with a check constraint, so a second row is impossible.

create table if not exists public.app_settings (
  id boolean primary key default true check (id),
  church_logo_url text,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id)
);

insert into public.app_settings (id) values (true) on conflict (id) do nothing;

alter table public.app_settings enable row level security;

-- Anyone signed in can READ it: the designer needs the logo, and it is a logo —
-- the least secret thing the church owns. Only a super admin can change it.
drop policy if exists app_settings_select on public.app_settings;
create policy app_settings_select on public.app_settings
  for select to authenticated using (true);

drop policy if exists app_settings_write on public.app_settings;
create policy app_settings_write on public.app_settings
  for all to authenticated
  using (public.is_super_admin())
  with check (public.is_super_admin());

-- Table-wide grants here are deliberate and safe: every column is public-facing
-- branding. Contrast checkin_settings, where a blanket grant exposed a PIN hash
-- (0054) — the lesson there was to check, not to narrow reflexively.
revoke all on public.app_settings from anon;
grant select on public.app_settings to authenticated;
grant insert, update on public.app_settings to authenticated;
