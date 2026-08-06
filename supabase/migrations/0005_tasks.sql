-- AriseHub — Tasks / assignments.
--
-- Requirements:
--  * Apostle & Pastor (Super_Admin) assign tasks to a whole DEPARTMENT.
--  * Department heads (department_members.role = 'lead') assign tasks to an
--    INDIVIDUAL member of a department they lead.
--  * Assignees see their tasks (individual + their departments') and can mark
--    them done. Leads/creators/Super_Admin manage.
--
-- Apply after 0002 (needs current_profile_id, is_department_lead).

-- true if the caller is a member of `dept` (SECURITY DEFINER → no RLS recursion).
create or replace function public.is_department_member(dept uuid) returns boolean
  language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from department_members
    where department_id = dept and profile_id = public.current_profile_id()
  )
$$;

create table tasks (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  status text not null default 'open' check (status in ('open', 'in_progress', 'done')),
  priority text not null default 'normal' check (priority in ('low', 'normal', 'high')),
  -- Exactly one of these is the target (enforced by the check below).
  assigned_department_id uuid references departments(id) on delete cascade,
  assigned_profile_id uuid references profiles(id) on delete cascade,
  created_by uuid references profiles(id),
  due_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint task_target_ck check (
    (assigned_department_id is not null) <> (assigned_profile_id is not null)
  )
);
create index tasks_department_idx on tasks(assigned_department_id);
create index tasks_profile_idx on tasks(assigned_profile_id);
create trigger t_tasks_upd before update on tasks
  for each row execute procedure extensions.moddatetime(updated_at);

alter table tasks enable row level security;

-- SELECT: creator, the assigned person, members/leads of the assigned
-- department, or Super_Admin.
create policy tasks_select on tasks for select to authenticated using (
  public.is_super_admin()
  or created_by = public.current_profile_id()
  or assigned_profile_id = public.current_profile_id()
  or (assigned_department_id is not null and public.is_department_member(assigned_department_id))
  or (assigned_department_id is not null and public.is_department_lead(assigned_department_id))
);

-- INSERT: created_by must be the caller, and the target must be one of:
--  * self — anyone can LOG their own ad-hoc task ("showed up, fixed the
--    livestream sound"), including after the fact, and mark it done;
--  * a department the caller BELONGS TO — note something a team did;
--  * (dept lead) their own department, or an individual who is a member of a
--    department they lead;
--  * (Super_Admin / Pastor & Apostle) anyone or any department.
create policy tasks_insert on tasks for insert to authenticated with check (
  created_by = public.current_profile_id()
  and (
    public.is_super_admin()
    or assigned_profile_id = public.current_profile_id()
    or (assigned_department_id is not null and public.is_department_member(assigned_department_id))
    or (assigned_department_id is not null and public.is_department_lead(assigned_department_id))
    or (
      assigned_profile_id is not null and exists (
        select 1 from department_members dm
        where dm.profile_id = tasks.assigned_profile_id
          and public.is_department_lead(dm.department_id)
      )
    )
  )
);

-- UPDATE: Super_Admin, the creator, or a lead of the assigned department can edit
-- fully; the assigned person can update (e.g. mark done). WITH CHECK keeps the
-- same guard so an assignee can't reassign a task away from themselves.
create policy tasks_update on tasks for update to authenticated
  using (
    public.is_super_admin()
    or created_by = public.current_profile_id()
    or assigned_profile_id = public.current_profile_id()
    or (assigned_department_id is not null and public.is_department_lead(assigned_department_id))
  )
  with check (
    public.is_super_admin()
    or created_by = public.current_profile_id()
    or assigned_profile_id = public.current_profile_id()
    or (assigned_department_id is not null and public.is_department_lead(assigned_department_id))
  );

-- DELETE: Super_Admin, creator, or a lead of the assigned department.
create policy tasks_delete on tasks for delete to authenticated using (
  public.is_super_admin()
  or created_by = public.current_profile_id()
  or (assigned_department_id is not null and public.is_department_lead(assigned_department_id))
);
