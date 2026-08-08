# Who can see what

The access model Arise Church actually works to, agreed 2026-08-08. Written down
because it lives across a role enum, RLS policies on a dozen tables, and the
check-in guards — and none of those explain the intent on their own.

**Status: specified, partly built.** `departments.can_check_in` exists (0058) and
is settable in Admin → Departments. Nothing enforces the model yet;
`is_checkin_role()` and the channel policies are unchanged. Read "Today" vs
"Agreed" below before assuming a rule is live.

## The hierarchy

Highest to lowest. Volunteer and Praise Team Member are **the same level** — two
names for one rung, because that is what the ministry calls them.

| Rung | Notes |
| --- | --- |
| Super Admin | Bradly, Kristina. Runs the system. |
| Admin | **Apostle and Pastor.** Full access, including every department chat. |
| Department Head | Leads one or more departments. |
| Staff | |
| Volunteer / Praise Team Member | Same rung, different name. |
| Member | Everyone else. |

### Apostle and Pastor are roles, not titles

`profiles.title` is free text and is documented as *"Display only — never
permissions."* It must stay that way. Apostle and Pastor become part of the
**Admin** rung; the title beside someone's name stays cosmetic. A permission that
can be granted by typing a word into a text box is not a permission.

## Departments scope what you see

You see your own department's material. Praise Team sees Praise Team; the
Children's Department sees the Children's Department.

### Group chats

- You see and are notified about the chats for departments you belong to.
- **Admin (Apostle, Pastor) sees every department chat.**
- **Super Admin does NOT.** Explicitly requested: Bradly and Kristina do not
  need to read, or be notified about, every department's conversation.

One honest caveat. A Super Admin can edit roles, including their own, so this is
a **courtesy boundary in the UI, not a security boundary**. It stops the noise
and the accidental over-reach; it does not stop a determined Super Admin, and
nothing built in the app can, because they administer the app. Worth having —
worth not mistaking for enforcement.

The "RLS won't let me send" error when posting to another department's chat is
the current policy working correctly: you may only post where you are a member.
It resolves when Admin gains full access, not before.

## Check-in is the exception

Check-in cuts across departments, so it does not follow the scoping rule.

**Agreed:** Super Admin, Admin and Staff can run check-in wherever they serve,
**plus anyone in a department flagged as running check-in.**

Today that flag is on the Children's Department and In Edge. Praise Team is
deliberately off — they never check anyone in, and a Praise Team volunteer
currently gets check-in access purely by holding the Volunteer role.

**Today:** `is_checkin_role()` and `lib/roles.ts` grant check-in to Super_Admin,
Staff and Volunteer, church-wide, ignoring departments entirely. That is both too
broad (every Praise Team volunteer) and too narrow (a Children's Department
member whose role is only Member).

`departments.can_check_in` is a flag rather than a list of slugs on purpose:
there are already 17 departments and the set that runs check-in changes. It is
set per department in Admin → Departments.

## Still to build

1. The `Admin` and `Department Head` rungs, and `Praise Team Member` as an alias
   of Volunteer.
2. Channel membership policies: Admin sees all, Super Admin does not.
3. Department scoping across People, Groups and Services.
4. Rewire check-in access to `elevated role OR member of a can_check_in
   department`, replacing the church-wide role list.
5. Notification routing to match — no push for chats you are not in.

Order matters. 4 changes who can reach children's records, so it wants its own
migration, its own role-impersonated tests, and a careful look at who is holding
a tablet on a Sunday morning before it ships.
