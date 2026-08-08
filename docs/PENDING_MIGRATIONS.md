# Supabase migrations

**Nothing is pending.** All 36 migrations (`0001`–`0034`, `0036`, `0037` — there
is no `0035`) are applied and recorded in `supabase_migrations.schema_migrations`,
verified 2026-08-07.

## How to apply the next one

The history table is now populated, so the CLI can do it:

```bash
npx supabase migration up --db-url "<connection string>"
```

The connection string is built from the Postgres password in
`.supabase-db-password` (gitignored):

```
postgresql://postgres.luzmqpfsylpqxbwzyjcz:<PERCENT-ENCODED-PASSWORD>@aws-1-us-west-2.pooler.supabase.com:5432/postgres
```

Percent-encode the password (`[uri]::EscapeDataString($p)` in PowerShell) — the
CLI requires it, and the current password contains characters that need it.

## Why not `supabase link`

`link` is broken on CLI 2.112.0 (current latest):

```
failed to get api keys: SchemaError(Expected a string matching the RegExp
^...T...(?:Z)$ at [2]["inserted_at"])
```

Its API-keys call validates `inserted_at` against a regex demanding a trailing
`Z`, and this project trips it because it uses the newer publishable/secret API
key format. Every other Management API call works (`projects list` is fine) — so
pass `--db-url` explicitly instead of linking. Retry `link` after a CLI upgrade.

`supabase db dump` and `db diff` are also unavailable here: both shell out to
Docker, which isn't running on this machine.

## History, so this doesn't get confusing again

Until 2026-08-07 this file claimed everything through `0020` was applied and
listed `0021`/`0022` as pending. That was wrong — `0030` grants `photo_path`, a
column `0021` adds, so `0021` had plainly been applied. The file had simply
stopped being maintained.

Worse, `supabase_migrations.schema_migrations` **did not exist at all**: every
migration had been pasted into the SQL editor by hand, and nothing recorded it.
Running `db push` in that state would have tried to replay all 36 migrations
against the live database. The table was backfilled with `migration repair
--status applied` after confirming each migration's distinctive object really
was present in the schema.

## Running SQL by hand

If you use the dashboard SQL editor, check the role first:

```sql
select current_user;
```

It must be `postgres`. If it says `authenticated`, role impersonation is on and
DDL will fail with *permission denied for table profiles* — because `0030`
deliberately removed `authenticated`'s table-wide SELECT. **Do not run the
`GRANT SELECT ON public.profiles TO authenticated` that Postgres suggests in the
hint**; it would undo `0030` and re-expose every member's email, phone, address
and emergency contacts to every signed-in user.
