-- Stop the same person being scheduled twice for one job, and retire the dead
-- half of the scheduling model.
--
-- A row in plan_assignments is a SLOT: a position on a plan, with profile_id
-- null until somebody fills it. So the constraint cannot be one row per
-- (plan, position) — a Sunday legitimately has three Vocals slots. What must
-- not happen is the same PERSON appearing twice against the same position on
-- the same plan, which nothing prevented.
--
-- Postgres treats NULLs as distinct in a unique index, which is exactly right
-- here: any number of UNFILLED slots for a position stay legal, while a filled
-- one is unique per person.
--
-- The position is folded to lower case and trimmed inside the index, so
-- "Sound", "sound" and "Sound " are one position rather than three. Free text
-- typed fresh each week drifts otherwise, and a rota split across three
-- spellings of the same job is the quiet version of this bug.
create unique index if not exists plan_assignments_slot_uniq
  on public.plan_assignments (plan_id, lower(btrim(position)), profile_id);

-- service_assignments was the earlier design, superseded by plan_assignments.
-- It holds no rows and nothing in app/, components/ or lib/ references it —
-- checked before dropping. Leaving it invites someone to write to the half of
-- the model that no screen reads.
drop table if exists public.service_assignments;
