// Worker entry point.
//
// @opennextjs/cloudflare generates .open-next/worker.js with a `fetch` handler
// and nothing else. Cloudflare Cron Triggers fire a Worker's `scheduled`
// handler — so with no `scheduled` export, no scheduled job could ever run.
// app/api/cron/README.md documented a schedule that had never fired, and
// wrangler.jsonc declared no crons either.
//
// This wraps the generated worker rather than replacing it: `fetch` is passed
// straight through, the Durable Object classes are re-exported unchanged, and
// `scheduled` is added on top.
//
// The scheduled handler dispatches back into our own `fetch`, so the cron
// routes stay ordinary Next route handlers — testable with curl, no duplicated
// logic, and no second Worker needing a copy of CRON_SECRET.
//
// Plain .js on purpose: it imports a build artifact that only exists after
// `opennextjs-cloudflare build`, and tsconfig only typechecks .ts/.tsx.

import openNextWorker from "./.open-next/worker.js";

export { DOQueueHandler, DOShardedTagCache, BucketCachePurge } from "./.open-next/worker.js";

/** Base URL for self-dispatch. Host is irrelevant — the request never leaves. */
const SELF = "https://arisehub.myfaithtech.com";

/**
 * Which jobs are due at this tick.
 *
 * There is ONE cron trigger, not three: the Workers Free plan allows five per
 * ACCOUNT and this account is at the limit. So a single 15-minute tick decides
 * for itself what is due.
 *
 * `scheduledTime` is the instant Cloudflare intended to fire, not when the
 * handler happened to start, so the minute is exact and each daily/weekly job
 * fires once — the tick at 23:00 has minute 0, the ones at :15/:30/:45 do not.
 */
function dueJobs(scheduledTime) {
  const t = new Date(scheduledTime);
  const [h, m, dow] = [t.getUTCHours(), t.getUTCMinutes(), t.getUTCDay()];
  const jobs = ["/api/cron/auto-checkout"]; // every tick
  // 23:00 UTC — nightly "you're serving tomorrow".
  if (h === 23 && m === 0) jobs.push("/api/cron/reminders?job=tomorrow");
  // Saturday 13:00 UTC — week-ahead digest, 7am Central (8am in winter).
  if (dow === 6 && h === 13 && m === 0) jobs.push("/api/cron/reminders?job=weekly");
  return jobs;
}

export default {
  fetch(request, env, ctx) {
    return openNextWorker.fetch(request, env, ctx);
  },

  async scheduled(event, env, ctx) {
    const run = async (path) => {
      try {
        const res = await openNextWorker.fetch(
          new Request(SELF + path, {
            method: "GET",
            // Header, not a query string — a secret in a URL ends up in access
            // logs, referrers and history.
            headers: { "x-cron-secret": env.CRON_SECRET ?? "" },
          }),
          env,
          ctx,
        );
        const body = await res.text();
        if (!res.ok) console.error(`cron ${path} -> ${res.status} ${body.slice(0, 400)}`);
        else console.log(`cron ${path} -> ${res.status} ${body.slice(0, 400)}`);
      } catch (e) {
        console.error(`cron ${path} threw`, e);
      }
    };

    // waitUntil so a slow job isn't cut off when the handler returns. Sequential
    // rather than parallel: the reminder job sends email and push, and it can
    // wait a second behind a couple of roster updates.
    ctx.waitUntil(
      (async () => {
        for (const path of dueJobs(event.scheduledTime)) await run(path);
      })(),
    );
  },
};
