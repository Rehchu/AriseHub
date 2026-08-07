-- AriseHub — image/file attachments on chat messages.
--
-- Media and Creatives share graphics constantly; a text-only chat pushes that
-- conversation back to text-message threads.
--
-- Files live in Supabase Storage; this records what belongs to which message so
-- RLS on `messages` governs who can see them (attachments inherit the channel's
-- privacy — a private department's images stay private).
--
-- Apply after 0002. Requires a public Storage bucket named `attachments`.

alter table messages add column if not exists attachment_url text;
alter table messages add column if not exists attachment_type text;
alter table messages add column if not exists attachment_name text;

-- `body` was NOT NULL; an image-only message has no text.
alter table messages alter column body drop not null;

-- Every message must still carry something.
alter table messages add constraint messages_content_ck
  check (
    (body is not null and length(trim(body)) > 0)
    or attachment_url is not null
  );
