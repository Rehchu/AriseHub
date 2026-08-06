import { Hono } from "hono";
import { drizzle } from "drizzle-orm/d1";
import { eq } from "drizzle-orm";
import { accessPasses, campuses } from "../db/schema";
import { requireAuth, requireRole } from "../lib/auth-middleware";
import { sha256Hex } from "../lib/crypto";
import { logAudit } from "../lib/audit";
import type { Env, Variables } from "../types";

const app = new Hono<{ Bindings: Env; Variables: Variables }>();
app.use("*", requireAuth);
app.use("*", requireRole("super_admin"));

// Readable code like AB7-K2M-4QX; charset omits ambiguous 0/O/1/I/L.
function generateCode(): string {
  const chars = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(9));
  const raw = [...bytes].map((b) => chars[b % chars.length]).join("");
  return `${raw.slice(0, 3)}-${raw.slice(3, 6)}-${raw.slice(6, 9)}`;
}

app.get("/", async (c) => {
  const db = drizzle(c.env.DB);
  const rows = await db
    .select({ pass: accessPasses, campusName: campuses.name })
    .from(accessPasses)
    .innerJoin(campuses, eq(accessPasses.campusId, campuses.id));
  return c.json({
    passes: rows.map(({ pass, campusName }) => {
      const { codeHash, ...safe } = pass;
      return { ...safe, campusName };
    }),
  });
});

app.post("/", async (c) => {
  const user = c.get("user");
  const body = await c.req.json<{ label: string; scope: "equipment" | "wifi"; campusId: number; wifiAllNetworks?: boolean }>();
  if (!body.label?.trim() || !body.scope || !body.campusId) {
    return c.json({ error: "label, scope, and campusId are required" }, 400);
  }
  if (!["equipment", "wifi"].includes(body.scope)) return c.json({ error: "Invalid scope" }, 400);

  const code = generateCode();
  const codeHash = await sha256Hex(code.replace(/-/g, ""));
  const db = drizzle(c.env.DB);
  const [created] = await db
    .insert(accessPasses)
    .values({
      label: body.label.trim(),
      codeHash,
      scope: body.scope,
      campusId: body.campusId,
      // Only meaningful for wifi scope; guest-only unless explicitly opted in.
      wifiAllNetworks: body.scope === "wifi" ? !!body.wifiAllNetworks : false,
      createdBy: user.id,
    })
    .returning();

  await logAudit(c.env, {
    userId: user.id,
    action: "created",
    entityType: "access_pass",
    entityId: created.id,
    details: { label: created.label, scope: created.scope },
  });

  const { codeHash: _omit, ...safe } = created;
  // The plaintext code is returned exactly once — same pattern as user temp passwords.
  return c.json({ pass: safe, code }, 201);
});

// Generate a fresh code for an existing pass (old code stops working). Lets an
// admin reprint a poster without recreating the pass — codes are one-time-shown.
app.post("/:id/rotate", async (c) => {
  const id = Number(c.req.param("id"));
  const db = drizzle(c.env.DB);
  const [existing] = await db.select().from(accessPasses).where(eq(accessPasses.id, id)).limit(1);
  if (!existing) return c.json({ error: "Not found" }, 404);

  const code = generateCode();
  const codeHash = await sha256Hex(code.replace(/-/g, ""));
  const [updated] = await db
    .update(accessPasses)
    .set({ codeHash, active: true })
    .where(eq(accessPasses.id, id))
    .returning();

  await logAudit(c.env, {
    userId: c.get("user").id,
    action: "code_rotated",
    entityType: "access_pass",
    entityId: id,
    details: { label: updated.label },
  });
  const { codeHash: _omit, ...safe } = updated;
  return c.json({ pass: safe, code });
});

app.delete("/:id", async (c) => {
  const id = Number(c.req.param("id"));
  const db = drizzle(c.env.DB);
  const [updated] = await db.update(accessPasses).set({ active: false }).where(eq(accessPasses.id, id)).returning();
  if (!updated) return c.json({ error: "Not found" }, 404);
  await logAudit(c.env, {
    userId: c.get("user").id,
    action: "revoked",
    entityType: "access_pass",
    entityId: id,
    details: { label: updated.label },
  });
  return c.json({ ok: true });
});

export default app;
