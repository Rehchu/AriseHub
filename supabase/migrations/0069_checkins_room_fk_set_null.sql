-- Deleting a room must not be blocked by, or destroy, attendance history.
--
-- checkins.room_id → rooms.id was NO ACTION, so removing a room that any child
-- had ever been checked into failed with a raw FK error. The column is
-- nullable, so ON DELETE SET NULL is correct: the room goes, every check-in
-- record survives with a null room (the attendance fact — who was here — is
-- what matters; the room label is not worth losing the record over).
alter table public.checkins drop constraint if exists checkins_room_id_fkey;
alter table public.checkins
  add constraint checkins_room_id_fkey
  foreign key (room_id) references public.rooms(id) on delete set null;
