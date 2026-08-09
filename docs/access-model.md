# Who can see what

The access model Arise Church actually works to, agreed 2026-08-08. Written down
because it lives across a role enum, RLS policies on a dozen tables, and the
check-in guards — and none of those explain the intent on their own.

**Status: built.** 0058–0065. Every rule below is live and covered by tests in
`tests/rls/access-control.test.mjs`.

One thing is NOT done, and it is the one that makes half of this visible:
**nobody has been given the `Admin` role yet.** Until the Apostle and Pastor are
set to it in Admin → People, their full chat access is deployed and inert.

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

## What was built, and where

| Rule | Migration | Notes |
| --- | --- | --- |
| The `Admin` rung | 0059 | One new enum value. Department Head was already `department_members.role = 'lead'`; Praise Team Member is a label, not a rung. |
| Admin sees every department chat; Super Admin does not | 0060 | The one place the two rungs differ. DMs stay private to their participants for everyone. |
| `departments.can_check_in` | 0058 | Additive; enforced nothing on purpose so the flag could be set and checked first. |
| Check-in = elevated role OR a check-in department | 0064 | One function, fifteen policies. Modelled against every real account first: nobody gained or lost. |
| Services scoped to the department | 0065 | Plus: a department lead can build their own schedule without being made Staff. |
| Notifying follows channel membership | — | `app/api/push/send`. |

### Two things deliberately NOT scoped

**The people directory.** Scoping it by department would mean not being able to
look up someone in your own church, which is the opposite of what a directory is
for. Contact details are already redacted unless you are staff or a department
lead (0030), and that is the right boundary — the *sensitive* fields are gated,
the names are not.

**Groups.** A small group is not a department. Discovering one you are not in yet
is the entire point of the page.

If either should change, they are one policy each — but neither follows from
"Praise team only sees praise team stuff", which was about *work*: rotas, chats,
and who runs check-in.

## Still to do

1. **Give the Apostle and Pastor the `Admin` role.** Nothing else here needs
   doing, and until this happens their chat access does nothing.
2. Nothing else. The model above is complete.
