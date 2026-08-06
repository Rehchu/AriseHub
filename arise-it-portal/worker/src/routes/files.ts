import { Hono } from "hono";
import { requireAuth } from "../lib/auth-middleware";
import type { Env, Variables } from "../types";

const app = new Hono<{ Bindings: Env; Variables: Variables }>();
app.use("*", requireAuth);

// Streams an object back out of the (private-by-default) R2 bucket, e.g.
// GET /api/files/assets/12/1720000000-photo.jpg
app.get("/*", async (c) => {
  const key = c.req.path.replace(/^\/api\/files\//, "");
  const object = await c.env.FILES.get(key);
  if (!object) return c.json({ error: "Not found" }, 404);

  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("etag", object.httpEtag);
  headers.set("cache-control", "private, max-age=3600");
  return new Response(object.body, { headers });
});

export default app;
