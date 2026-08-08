-- AriseHub — make the Connect Card's bot protection real.
--
-- PublicForm rendered a Turnstile widget, kept the token in React state, and
-- then inserted straight into form_submissions from the browser without ever
-- sending it. Nothing verified anything. And because the policy was
--
--     form_submissions_insert_anon ... with check (form_is_active(form_id))
--
-- a script with the publishable key — which ships in the client bundle — could
-- POST PostgREST directly and fill the table, Turnstile or no Turnstile.
--
-- Submissions now go through /api/forms/submit, which verifies the token and
-- writes with the service role. Dropping the direct INSERT policies is what
-- makes that the only way in; leaving them would make the endpoint a
-- suggestion rather than a gate.
--
-- form_is_active is still enforced — the route checks it explicitly, because
-- the service role bypasses RLS.
--
-- Reading submissions is unchanged: form_submissions_select still requires
-- can_manage_form().
--
-- Apply after 0051.

drop policy if exists form_submissions_insert_anon on form_submissions;
drop policy if exists form_submissions_insert_auth on form_submissions;

comment on table form_submissions is
  'Written only by /api/forms/submit, which verifies Turnstile and uses the '
  'service role. There is deliberately no INSERT policy — a direct client '
  'insert would bypass the bot check.';
