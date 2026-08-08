# Pending Supabase migrations

Run these in the Supabase SQL editor, in order.

| File | What it adds | Status |
|---|---|---|
| `0037_hidden_profiles_super_admin_only.sql` | Narrows who can see hidden profiles from `can_see_contact_info()` (Super_Admin + IT_Admin + Staff + every department lead) to Super_Admin only, and grants UPDATE on `hidden_from_directory` explicitly | ⏳ pending |

## What is actually applied is not currently known

This file used to claim "everything through `0020` is already applied" and list
`0021`/`0022` as pending. That was wrong — `0030` grants `photo_path`, a column
`0021` adds, so `0021` had clearly been applied. The list had simply stopped
being maintained.

Migrations here are applied by hand through the SQL editor, and nothing records
which ones ran. So **the only honest statement is that the applied set is
unverified**. Everything through `0036` is *believed* applied (`0036` was
confirmed by hand on 2026-08-07), but it has not been checked against the
database.

To fix this properly, link the Supabase CLI once:

```bash
npx supabase login
```

```bash
npx supabase link --project-ref luzmqpfsylpqxbwzyjcz
```

Then `npx supabase migration list` shows local-vs-remote, and
`npx supabase migration repair` can backfill the history table so future
migrations apply with `db push` instead of copy-paste. Do **not** run
`db push` before checking that list — with an empty history table it will try
to replay all 37 migrations against a live database.
