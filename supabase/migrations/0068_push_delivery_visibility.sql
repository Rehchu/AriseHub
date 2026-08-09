-- Make push delivery VISIBLE per device.
--
-- "Is it working on her iPad?" has been answered by querying the database by
-- hand three days running. The send paths already know exactly what each push
-- service said about each device — they were just discarding it. Recorded
-- here, the settings page can show "accepted 6:31pm" or "failing (525)" next
-- to each registered device, and nobody has to guess which device a
-- registration belongs to by reading user-agent strings.

alter table public.push_subscriptions
  add column if not exists last_sent_at timestamptz,
  add column if not exists last_status text;

comment on column public.push_subscriptions.last_status is
  'What the push service said about the most recent send: e.g. "accepted", '
  '"accepted via relay", "failed (525)". Display only — pruning still keys '
  'off live 404/410 responses, never off this.';
