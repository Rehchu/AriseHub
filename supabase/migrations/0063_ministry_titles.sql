-- Ministry titles as data, with an access level attached.
--
-- profiles.title has been free text: a suggestion list in the UI and nothing
-- behind it. Two problems with that. You could not add "Children's Director"
-- without a code change, and a title said nothing about what the person could
-- do — "Apostle" was a word beside a name while their role stayed Member.
--
-- So a title is a row now, and a row may carry a role. Assigning the title in
-- Admin > People offers that role alongside it.
--
-- The role is OFFERED, never silently applied by the database. A trigger that
-- changed someone's access because an admin picked a word from a dropdown is
-- exactly the kind of quiet privilege change that is impossible to audit later.
-- The UI shows what it is about to do and the admin confirms it; profiles.role
-- remains the single source of truth for access, and the privileged-field
-- trigger from 0036 still guards every change to it.
--
-- profiles.title stays free text and is NOT a foreign key. Retitling or
-- deleting a title must never blank out what someone is called, and the church
-- has history in that column already.

create table if not exists public.ministry_titles (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  /** Access this title implies. Null = a label only, no access attached. */
  role public.user_role,
  sort_order int not null default 100,
  created_at timestamptz not null default now()
);

alter table public.ministry_titles enable row level security;

-- Everyone reads: titles are shown beside names all over the app.
drop policy if exists ministry_titles_select on public.ministry_titles;
create policy ministry_titles_select on public.ministry_titles
  for select to authenticated using (true);

-- Only a super admin defines them — a title that grants Admin is a privilege
-- decision, not a piece of copy.
drop policy if exists ministry_titles_write on public.ministry_titles;
create policy ministry_titles_write on public.ministry_titles
  for all to authenticated
  using (public.is_super_admin())
  with check (public.is_super_admin());

revoke all on public.ministry_titles from anon;
grant select, insert, update, delete on public.ministry_titles to authenticated;

-- The list the church actually uses, in the order they'd read it. Roles are
-- attached only where the title genuinely implies access: Apostle and Pastor
-- are the Admin rung (0059), the directors and leaders run a department, and
-- everything else is a label.
insert into public.ministry_titles (name, role, sort_order) values
  ('Apostle',              'Admin',     10),
  ('Pastor',               'Admin',     20),
  ('Co-Pastor',            'Admin',     30),
  ('Elder',                 null,       40),
  ('Minister',              null,       50),
  ('Deacon',                null,       60),
  ('Children''s Director', 'Staff',     70),
  ('Youth Director',       'Staff',     80),
  ('Media Director',       'Staff',     90),
  ('Praise Team Leader',   'Volunteer', 100),
  ('Worship Leader',       'Volunteer', 110),
  ('Department Head',      'Staff',     120),
  ('Administrator',        'Staff',     130),
  ('Armor Bearer',          null,       140),
  ('Usher',                 null,       150),
  ('Greeter',               null,       160)
on conflict (name) do nothing;
