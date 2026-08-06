-- AriseHub — name tag designer templates.
-- The design is stored as JSON (elements + canvas settings) so the check-in
-- station can render it to an image and print it on any DYMO label.
-- Apply after 0013.

create table nametag_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  -- Physical label size in inches (30252 Address = 3.5 x 1.125).
  width_in numeric not null default 3.5,
  height_in numeric not null default 1.125,
  design jsonb not null default '{"background":"#ffffff","elements":[]}'::jsonb,
  is_default boolean not null default false,
  kind text not null default 'child' check (kind in ('child', 'guardian')),
  created_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger t_nametag_templates_upd before update on nametag_templates
  for each row execute procedure extensions.moddatetime(updated_at);

alter table nametag_templates enable row level security;

-- Everyone running check-in can read templates; Staff/Super_Admin design them.
create policy nametag_templates_select on nametag_templates
  for select to authenticated using (true);
create policy nametag_templates_write on nametag_templates
  for all to authenticated
  using (public.is_staff()) with check (public.is_staff());
