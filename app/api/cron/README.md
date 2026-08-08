# Scheduled jobs

Cloudflare Cron fires the Worker's `scheduled` handler, which dispatches back
into our own `fetch` and calls these routes.

## This did not work until 2026-08-08

`@opennextjs/cloudflare` generates a worker that exports `fetch` and nothing
else. Cron Triggers fire `scheduled`. With no such export, **no scheduled job
could ever have run** — and `wrangler.jsonc` declared no `triggers.crons`
either, so none were registered in the first place. The schedule below was
documented but had never fired once.

`worker-entry.js` now wraps the generated worker: `fetch` passes straight
through, the Durable Object classes are re-exported unchanged, and `scheduled`
is added on top. It maps each cron expression to a route, so keep it in sync
with `triggers.crons` in `wrangler.jsonc`.

## Schedule

| Cron (UTC) | Route | What |
|---|---|---|
| `*/15 * * * *` | `/api/cron/auto-checkout` | Close out children nobody checked out |
| `0 23 * * *` | `/api/cron/reminders?job=tomorrow` | "You're serving tomorrow" push + email |
| `0 13 * * 6` | `/api/cron/reminders?job=weekly` | Saturday 7am Central week-ahead digest |

### Why auto-checkout runs every 15 minutes

Cron expressions are UTC. "Sunday 1:30pm Central" is `30 18 * * 0` in summer and
`30 19 * * 0` in winter — a fixed expression drifts an hour at each DST change
and would eventually start closing children out mid-service.

So the sweep runs every 15 minutes and decides for itself: for each campus it
reads the local wall clock in that campus's own `timezone` and compares it to
the cutoffs in `checkin_auto_checkout_rules`. When nothing has passed it exits
after two queries. Cutoffs are editable in Admin → Check-in without a deploy.

## Calling by hand

The secret goes in a header. It used to be accepted as `?key=`, which put it in
access logs, referrers and browser history — and `/api/cron/` is on the
middleware's public allowlist, so the URL is reachable by anyone.

```
curl -H "x-cron-secret: $CRON_SECRET" \
  "https://arisehub.myfaithtech.com/api/cron/auto-checkout"

curl -H "x-cron-secret: $CRON_SECRET" \
  "https://arisehub.myfaithtech.com/api/cron/reminders?job=tomorrow"
```

`CRON_SECRET` is a Worker secret. Without it the endpoint returns 403, so nobody
who finds the URL can spam the church with emails or close out a live roster.
