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
 * Cron schedule -> route. Keep in sync with `triggers.crons` in wrangler.jsonc;
 * Cloudflare passes the matched cron expression as `event.cron`.
 */
const JOBS = {
  "*/15 * * * *": "/api/cron/auto-checkout",
  "0 23 * * *": "/api/cron/reminders?job=tomorrow",
  "0 13 * * 6": "/api/cron/reminders?job=weekly",
};

export default {
  fetch(request, env, ctx) {
    return openNextWorker.fetch(request, env, ctx);
  },

  async scheduled(event, env, ctx) {
    const path = JOBS[event.cron];
    if (!path) {
      console.error(`No job mapped to cron "${event.cron}"`);
      return;
    }

    const run = async () => {
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
        if (!res.ok) console.error(`${path} -> ${res.status} ${body.slice(0, 400)}`);
        else console.log(`${path} -> ${res.status} ${body.slice(0, 400)}`);
      } catch (e) {
        console.error(`${path} threw`, e);
      }
    };

    // waitUntil so a slow job isn't cut off when the handler returns.
    ctx.waitUntil(run());
  },
};
