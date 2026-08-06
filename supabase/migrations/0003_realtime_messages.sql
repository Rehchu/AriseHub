-- AriseHub — enable Supabase Realtime for messaging.
-- The chat UI subscribes to INSERT/UPDATE on `messages` (filtered by channel_id).
-- RLS still applies to realtime: a subscriber only receives rows for channels
-- they belong to (messages_select policy from 0002).
--
-- Apply after 0002 (SQL editor, or `supabase db push`).

alter publication supabase_realtime add table public.messages;

-- REPLICA IDENTITY FULL so UPDATE/DELETE payloads carry the full old row
-- (needed for edit/soft-delete events to update the right message client-side).
alter table public.messages replica identity full;
