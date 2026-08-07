-- AriseHub — stop serving private media to the open internet.
--
-- `attachments` and `photos` were public buckets. Confirmed against the live
-- project: the anonymous public endpoint returned NoSuchKey (bucket exists,
-- object missing) rather than "Bucket not found". So every message attachment,
-- profile photo, and photo of a child or parent was readable by anyone holding
-- the URL — no login, no expiry, and anyone removed from a department kept
-- their old links.
--
-- The app now stores object paths and signs them on demand for an hour
-- (lib/storage-url.ts). Legacy rows hold a full public URL; the path is
-- recovered from it, so nothing needs backfilling.
--
-- Deploy the app BEFORE running this — flipping the buckets first would break
-- every existing image until the signing code ships.

update storage.buckets set public = false where id in ('attachments', 'photos');

-- Signing requires the caller to be able to select the object row. Read and
-- write stay open to any signed-in person, which matches how these are used:
-- department chat, check-in stations, and your own profile photo. The gate is
-- "is a member of this church", not "is in this department" — worth tightening
-- per-bucket later, but it is already a large step up from world-readable.
drop policy if exists "authenticated read attachments" on storage.objects;
create policy "authenticated read attachments" on storage.objects
  for select to authenticated
  using (bucket_id in ('attachments', 'photos', 'checkin-photos'));

drop policy if exists "authenticated write attachments" on storage.objects;
create policy "authenticated write attachments" on storage.objects
  for insert to authenticated
  with check (bucket_id in ('attachments', 'photos', 'checkin-photos'));
