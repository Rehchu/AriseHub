-- AriseHub — universal invite links.
--
-- Public self-signup stays OFF (nobody can register by finding the site).
-- Instead an admin creates a shareable link carrying a secret code; anyone with
-- the link registers themselves and lands with the role, campus and departments
-- the link specifies.
--
-- The code is a bearer secret, so links are revocable, can expire, and can cap
-- how many people use them.
--
-- Apply after 0002.

create table invite_links (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  label text not null default 'General invite',
  role user_role not null default 'Member',
  campus_id uuid references campuses(id),
  department_ids uuid[] not null default '{}',
  active boolean not null default true,
  expires_at timestamptz,
  max_uses int,                 -- null = unlimited
  uses int not null default 0,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now()
);
create index invite_links_code_idx on invite_links(code);

alter table invite_links enable row level security;

-- Only Super_Admin manages links. Validation on the public join page runs
-- server-side with the service role, so the anon role needs NO access here —
-- a visitor can never enumerate or read invite links.
create policy invite_links_admin on invite_links
  for all to authenticated
  using (public.is_super_admin())
  with check (public.is_super_admin());
