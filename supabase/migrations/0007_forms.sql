-- AriseHub — Connect Cards / form builder.
-- Guests fill a public form (no login); Staff build forms and read submissions.
-- Apply after 0002 (needs current_profile_id, is_super_admin).
--
-- Model: forms → form_fields (ordered) → form_submissions (data jsonb).
-- Public submit path uses the ANON role against an ACTIVE form only.

create table forms (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  slug text unique not null,                 -- public URL: /f/<slug>
  description text,
  campus_id uuid references campuses(id),
  is_active boolean not null default true,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger t_forms_upd before update on forms
  for each row execute procedure extensions.moddatetime(updated_at);

create table form_fields (
  id uuid primary key default gen_random_uuid(),
  form_id uuid not null references forms(id) on delete cascade,
  label text not null,
  field_type text not null default 'text'
    check (field_type in ('text', 'textarea', 'email', 'phone', 'select', 'checkbox', 'date')),
  options jsonb,                             -- for select: ["A","B"]
  required boolean not null default false,
  sort_order int not null default 0
);
create index form_fields_form_idx on form_fields(form_id, sort_order);

create table form_submissions (
  id uuid primary key default gen_random_uuid(),
  form_id uuid not null references forms(id) on delete cascade,
  submitted_by uuid references profiles(id), -- null = guest
  submitter_name text,                       -- convenience for guest cards
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index form_submissions_form_idx on form_submissions(form_id, created_at desc);

-- true if the caller may manage a form (its creator, or Super_Admin).
create or replace function public.can_manage_form(fid uuid) returns boolean
  language sql stable security definer set search_path = public as $$
  select public.is_super_admin() or exists (
    select 1 from forms where id = fid and created_by = public.current_profile_id()
  )
$$;

-- true if a form is active (SECURITY DEFINER so anon field/submit policies can
-- check it without needing select rights on forms).
create or replace function public.form_is_active(fid uuid) returns boolean
  language sql stable security definer set search_path = public as $$
  select exists (select 1 from forms where id = fid and is_active)
$$;

alter table forms enable row level security;
alter table form_fields enable row level security;
alter table form_submissions enable row level security;

-- forms: anon can read ACTIVE forms (to render the public page); authenticated
-- read all (management list is filtered in the app). Manage: creator/Super_Admin.
create policy forms_select_anon on forms for select to anon using (is_active);
create policy forms_select_auth on forms for select to authenticated using (true);
create policy forms_insert on forms for insert to authenticated
  with check (created_by = public.current_profile_id());
create policy forms_update on forms for update to authenticated
  using (public.can_manage_form(id)) with check (public.can_manage_form(id));
create policy forms_delete on forms for delete to authenticated
  using (public.can_manage_form(id));

-- form_fields: readable when the parent form is active (anon) or to any
-- authenticated user; managed by the form's manager.
create policy form_fields_select_anon on form_fields for select to anon
  using (public.form_is_active(form_id));
create policy form_fields_select_auth on form_fields for select to authenticated
  using (true);
create policy form_fields_write on form_fields for all to authenticated
  using (public.can_manage_form(form_id))
  with check (public.can_manage_form(form_id));

-- submissions: anyone (guest or member) can submit to an ACTIVE form. Only the
-- form's manager (or Super_Admin) can read submissions.
create policy form_submissions_insert_anon on form_submissions for insert to anon
  with check (public.form_is_active(form_id));
create policy form_submissions_insert_auth on form_submissions for insert to authenticated
  with check (public.form_is_active(form_id));
create policy form_submissions_select on form_submissions for select to authenticated
  using (public.can_manage_form(form_id));
