-- AriseHub — make the offline check-in queue idempotent for real.
--
-- lib/offline-queue.ts documents localId as "the idempotency key, so a retry
-- can't duplicate", and CheckinStation never sent it. There was no column to
-- receive it and no constraint to enforce it, so the queue's own duplicate
-- handling —
--
--     if (/duplicate|already exists/i.test(error.message)) { synced++; }
--
-- could never fire, because nothing ever raised that error. A response lost in
-- flight (the insert lands, the reply doesn't) re-queued a row that was already
-- saved, and the next flush inserted it again. On flaky church WiFi, which is
-- the entire reason the offline queue exists, that is the expected case rather
-- than the unlucky one.
--
-- Duplicated check-ins matter beyond tidiness: checkins is the child-safety
-- attendance record, and two rows for one child mean two security codes, only
-- one of which is on the badge in a parent's hand.
--
-- Partial unique index rather than a plain unique constraint: rows created at
-- the desk while online have no localId, and NULLs must not collide.
--
-- Apply after 0046.

alter table checkins
  add column if not exists local_id uuid;

comment on column checkins.local_id is
  'Client-generated idempotency key for offline check-ins. Null for check-ins '
  'created online. Unique where present, so replaying a queued row is a no-op '
  'instead of a duplicate.';

create unique index if not exists checkins_local_id_uidx
  on public.checkins (local_id)
  where local_id is not null;
