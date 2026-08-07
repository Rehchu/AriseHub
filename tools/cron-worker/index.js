/**
 * AriseHub scheduler.
 *
 * Calls the app's cron endpoints on a schedule. CRON_SECRET is a Worker secret
 * shared with the app, so the endpoints stay closed to anyone who finds them.
 */
export default {
  async scheduled(event, env, ctx) {
    // Saturday 13:00 UTC is the weekly digest; everything else is the nightly
    // "you're serving tomorrow" nudge.
    const job = event.cron === "0 13 * * 6" ? "weekly" : "tomorrow";
    const url = `${env.APP_URL}/api/cron/reminders?job=${job}`;

    ctx.waitUntil(
      fetch(url, { headers: { "x-cron-secret": env.CRON_SECRET } })
        .then(async (r) => {
          const body = await r.text();
          console.log(`[${job}] ${r.status} ${body.slice(0, 200)}`);
        })
        .catch((e) => console.error(`[${job}] failed:`, e.message)),
    );
  },

  // Manual trigger for testing: /?job=weekly with the secret.
  async fetch(req, env) {
    const u = new URL(req.url);
    if (u.searchParams.get("key") !== env.CRON_SECRET) {
      return new Response("forbidden", { status: 403 });
    }
    const job = u.searchParams.get("job") ?? "tomorrow";
    const r = await fetch(`${env.APP_URL}/api/cron/reminders?job=${job}`, {
      headers: { "x-cron-secret": env.CRON_SECRET },
    });
    return new Response(await r.text(), { status: r.status });
  },
};
