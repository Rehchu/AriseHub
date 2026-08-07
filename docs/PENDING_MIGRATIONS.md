# Pending Supabase migrations

Run these in the Supabase SQL editor, in order. Everything through `0020` is
already applied.

| File | What it adds | Status |
|---|---|---|
| `0021_plan_departments_and_photos.sql` | Department on service plans (so the schedule calendar can filter), `photo_path` on profiles | ⏳ pending |
| `0022_message_attachments.sql` | Image/file attachments on chat messages | ⏳ pending |

## Also needs doing once, in the Supabase dashboard

Two **public** Storage buckets (Storage → New bucket):

- `photos` — child and parent photos from family registration
- `attachments` — images and PDFs shared in chat

Both features degrade gracefully until the buckets exist: the UI explains
what's missing rather than failing silently.
