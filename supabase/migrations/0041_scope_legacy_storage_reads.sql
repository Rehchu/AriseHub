-- AriseHub — stop every signed-in member reading every object in Storage.
--
-- 0031 made the buckets private but gated access on bucket_id alone:
--   using (bucket_id in ('attachments', 'photos', 'checkin-photos'))
-- No ownership check, no membership check. Its own comment said so and deferred
-- it. Verified against production: a plain Member could list every object.
--
-- What the data actually looks like (checked before writing this):
--   * only two buckets exist, `attachments` and `photos`, both private.
--     `checkin-photos` was never created — the policy named a bucket that does
--     not exist, so the scary-sounding part of that list was already moot.
--   * `photos` is empty. `attachments` holds 3 objects: two profile photos
--     under `profiles/`, and `zz-audit/probe.txt`, a leftover test file.
--   * nothing writes to Supabase Storage any more. The only call left in the
--     app is createSignedUrl in lib/storage-url.ts. Uploads go to R2 through
--     /api/files/upload, which re-checks the session on every request instead
--     of trusting a signature that outlives someone's access.
--   * exactly 1 profile still has a legacy (non-`r2:`) photo_url.
--
-- So reads narrow to the one case still in use — profile photos, which the
-- directory already shows church-wide — and writes close entirely.
--
-- Verified after applying: a Member sees the 2 profile photos and nothing else;
-- zz-audit/probe.txt is invisible; INSERT is denied.
--
-- Apply after 0040.

drop policy if exists "authenticated read attachments" on storage.objects;
create policy "authenticated read profile photos" on storage.objects
  for select to authenticated
  using (
    bucket_id in ('attachments', 'photos')
    and (
      name like 'profiles/%'
      or owner = auth.uid()
    )
  );

-- Nothing has written here since media moved to R2, so an INSERT policy is a
-- hole with no purpose. Removed rather than narrowed.
drop policy if exists "authenticated write attachments" on storage.objects;

comment on policy "authenticated read profile photos" on storage.objects is
  'Legacy Supabase Storage reads only. New media lives in R2 behind '
  '/api/files, which re-checks the session on every request.';
