# Scheduled jobs

Cloudflare Cron fires the Worker's `scheduled` handler, which calls these
routes. They're also callable by hand for testing:

    curl "https://arisehub.myfaithtech.com/api/cron/reminders?job=tomorrow&key=$CRON_SECRET"
    curl "https://arisehub.myfaithtech.com/api/cron/reminders?job=weekly&key=$CRON_SECRET"

`CRON_SECRET` is a Worker secret — without it the endpoint returns 403, so
nobody who finds the URL can spam the church with emails.

Schedule (UTC):
- `0 23 * * *` — nightly "you're serving tomorrow"
- `0 13 * * 6` — Saturday 7am CST week-ahead digest
