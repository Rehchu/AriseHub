# Tests

```bash
npm test
```

## What this covers, and why it exists

`tests/rls/` checks **who can see and do what**. It runs against the real
database, because that is the only place the policies exist. They are not in the
application code, and reading `supabase/migrations/` tells you what somebody
intended, not what is live.

That distinction is the whole point. On 2026-08-08 an audit of the migration
files missed several holes and wrongly flagged others. What actually found them
was running each query as the role that does the work:

- `leads_all_departments('{}')` is vacuously true, so **any** member could mint
  an unlimited, never-expiring invite link and reopen public signup.
- A Volunteer or Staff member could become Super_Admin in one statement by
  nulling their own `user_id` — the privileged-field trigger tested
  `new.user_id`, and null made the comparison NULL rather than true.
- Anyone could insert themselves into any group as `leader`.
- `family registration` had **never** worked for the Volunteers and Staff who
  use it: four separate failures in one form, all invisible when testing as an
  admin.
- Revoking EXECUTE on the SECURITY DEFINER helpers looked safe against a policy
  whose `USING` clause is literally `true` — and took the People directory down
  for everyone.

Each of those is now a test.

## How it works

Everything runs inside **one transaction that is always rolled back**, so the
suite never writes to the database it is testing. Each assertion is wrapped in a
`SAVEPOINT`, because an RLS denial raises and would otherwise abort the
transaction and cascade into every later test.

Fixtures are created as `postgres` (which owns the tables and bypasses RLS —
setup is not the thing under test). Assertions run as `authenticated` with a
forged `request.jwt.claims`, which is exactly how PostgREST executes a signed-in
user's query, so `auth.uid()` resolves and every policy evaluates for real.

## Credentials

Reads `.supabase-db-password` at the repo root (gitignored), or
`SUPABASE_DB_URL` if set. With neither, every test **skips** with a message —
deliberately, so a machine without credentials doesn't report a false green.
Check the summary says `skipped`, not `pass`, if you expected it to run.

## Adding a case

Add it when you change a policy, and write the assertion as the consequence
rather than the mechanism — `"a member cannot enumerate the Elders roster"`,
not `"department_members_select uses is_private_department"`. A red test should
say what broke for whom.

Both directions matter. Half of these assert that something is still *allowed*:
that a member can join a group, that leadership can still read contact details,
that a volunteer can record an allergy. Tightening a policy until nothing works
is easy, and those cases are what caught it.
