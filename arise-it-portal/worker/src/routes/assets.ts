import { Hono } from "hono";
import { drizzle } from "drizzle-orm/d1";
import { and, eq, like, or, desc, sql } from "drizzle-orm";
import { assets, assetHistory, maintenanceRecords, assetModels, categories } from "../db/schema";
import { requireAuth, requireRole, campusFilter } from "../lib/auth-middleware";
import { logAudit } from "../lib/audit";
import { parseCsv } from "../lib/csv";
import type { Env, Variables } from "../types";

const app = new Hono<{ Bindings: Env; Variables: Variables }>();
app.use("*", requireAuth);

async function nextAssetTag(db: ReturnType<typeof drizzle>): Promise<string> {
  const [{ count }] = (await db.select({ count: sql<number>`count(*)` }).from(assets)) as { count: number }[];
  return `CHURCH-${String(count + 1).padStart(4, "0")}`;
}

app.get("/", async (c) => {
  const user = c.get("user");
  const { campusId, categoryId, status, locationId, search } = c.req.query();
  const db = drizzle(c.env.DB);

  const scopedCampusId = campusFilter(user, campusId ? Number(campusId) : undefined);

  const conditions = [];
  if (scopedCampusId !== undefined) conditions.push(eq(assets.campusId, scopedCampusId));
  if (locationId) conditions.push(eq(assets.locationId, Number(locationId)));
  if (status) conditions.push(eq(assets.status, status as any));
  if (search) {
    conditions.push(
      or(like(assets.assetTag, `%${search}%`), like(assets.serialNumber, `%${search}%`), like(assets.notes, `%${search}%`))
    );
  }

  let rows = await db
    .select({
      asset: assets,
      model: assetModels,
      categoryId: assetModels.categoryId,
    })
    .from(assets)
    .innerJoin(assetModels, eq(assets.modelId, assetModels.id))
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(assets.createdAt));

  if (categoryId) rows = rows.filter((r) => r.categoryId === Number(categoryId));

  return c.json({ assets: rows.map((r) => ({ ...r.asset, model: r.model })) });
});

app.get("/:id", async (c) => {
  const id = Number(c.req.param("id"));
  const db = drizzle(c.env.DB);
  const [row] = await db
    .select({ asset: assets, model: assetModels })
    .from(assets)
    .innerJoin(assetModels, eq(assets.modelId, assetModels.id))
    .where(eq(assets.id, id))
    .limit(1);
  if (!row) return c.json({ error: "Not found" }, 404);

  const history = await db.select().from(assetHistory).where(eq(assetHistory.assetId, id)).orderBy(desc(assetHistory.createdAt));
  const maintenance = await db
    .select()
    .from(maintenanceRecords)
    .where(eq(maintenanceRecords.assetId, id))
    .orderBy(desc(maintenanceRecords.performedAt));

  return c.json({ asset: { ...row.asset, model: row.model }, history, maintenance });
});

app.post("/", requireRole("super_admin", "campus_admin"), async (c) => {
  const user = c.get("user");
  const body = await c.req.json<{
    serialNumber?: string;
    modelId: number;
    campusId: number;
    locationId?: number;
    purchaseDate?: string;
    purchaseCost?: number;
    warrantyExpiry?: string;
    notes?: string;
    photoUrl?: string;
  }>();
  if (!body.modelId || !body.campusId) return c.json({ error: "modelId and campusId are required" }, 400);
  if (user.role === "campus_admin" && user.campusId !== body.campusId) {
    return c.json({ error: "Forbidden for this campus" }, 403);
  }

  const db = drizzle(c.env.DB);
  const assetTag = await nextAssetTag(db);
  const [created] = await db
    .insert(assets)
    .values({ ...body, assetTag, createdBy: user.id })
    .returning();

  await db.insert(assetHistory).values({ assetId: created.id, action: "created", performedBy: user.id });
  await logAudit(c.env, { userId: user.id, action: "created", entityType: "asset", entityId: created.id });
  return c.json({ asset: created }, 201);
});

app.put("/:id", requireRole("super_admin", "campus_admin"), async (c) => {
  const id = Number(c.req.param("id"));
  const user = c.get("user");
  const body = await c.req.json<Record<string, unknown>>();
  const db = drizzle(c.env.DB);

  const [existing] = await db.select().from(assets).where(eq(assets.id, id)).limit(1);
  if (!existing) return c.json({ error: "Not found" }, 404);
  if (user.role === "campus_admin" && user.campusId !== existing.campusId) return c.json({ error: "Forbidden" }, 403);

  const [updated] = await db
    .update(assets)
    .set({ ...body, updatedAt: new Date().toISOString() })
    .where(eq(assets.id, id))
    .returning();

  await db.insert(assetHistory).values({ assetId: id, action: "updated", performedBy: user.id });
  await logAudit(c.env, { userId: user.id, action: "updated", entityType: "asset", entityId: id, details: body });
  return c.json({ asset: updated });
});

app.delete("/:id", requireRole("super_admin"), async (c) => {
  const id = Number(c.req.param("id"));
  const db = drizzle(c.env.DB);
  await db.delete(maintenanceRecords).where(eq(maintenanceRecords.assetId, id));
  await db.delete(assetHistory).where(eq(assetHistory.assetId, id));
  await db.delete(assets).where(eq(assets.id, id));
  await logAudit(c.env, { userId: c.get("user").id, action: "deleted", entityType: "asset", entityId: id });
  return c.json({ ok: true });
});

app.post("/:id/checkout", requireRole("super_admin", "campus_admin"), async (c) => {
  const id = Number(c.req.param("id"));
  const user = c.get("user");
  const { assignedToUserId, assignedToName, notes } = await c.req.json<{
    assignedToUserId?: number;
    assignedToName?: string;
    notes?: string;
  }>();
  if (!assignedToUserId && !assignedToName) return c.json({ error: "Provide assignedToUserId or assignedToName" }, 400);

  const db = drizzle(c.env.DB);
  const [updated] = await db
    .update(assets)
    .set({ status: "checked_out", assignedToUserId: assignedToUserId ?? null, assignedToName: assignedToName ?? null, updatedAt: new Date().toISOString() })
    .where(eq(assets.id, id))
    .returning();
  if (!updated) return c.json({ error: "Not found" }, 404);

  await db.insert(assetHistory).values({
    assetId: id,
    action: "checked_out",
    toValue: assignedToName ?? String(assignedToUserId),
    performedBy: user.id,
    notes,
  });
  await logAudit(c.env, { userId: user.id, action: "checked_out", entityType: "asset", entityId: id });
  return c.json({ asset: updated });
});

app.post("/:id/checkin", requireRole("super_admin", "campus_admin"), async (c) => {
  const id = Number(c.req.param("id"));
  const user = c.get("user");
  const { notes } = await c.req.json<{ notes?: string }>().catch(() => ({ notes: undefined }));

  const db = drizzle(c.env.DB);
  const [updated] = await db
    .update(assets)
    .set({ status: "available", assignedToUserId: null, assignedToName: null, updatedAt: new Date().toISOString() })
    .where(eq(assets.id, id))
    .returning();
  if (!updated) return c.json({ error: "Not found" }, 404);

  await db.insert(assetHistory).values({ assetId: id, action: "checked_in", performedBy: user.id, notes });
  await logAudit(c.env, { userId: user.id, action: "checked_in", entityType: "asset", entityId: id });
  return c.json({ asset: updated });
});

app.post("/:id/status", requireRole("super_admin", "campus_admin"), async (c) => {
  const id = Number(c.req.param("id"));
  const user = c.get("user");
  const { status, notes } = await c.req.json<{ status: string; notes?: string }>();
  const db = drizzle(c.env.DB);
  const [existing] = await db.select().from(assets).where(eq(assets.id, id)).limit(1);
  if (!existing) return c.json({ error: "Not found" }, 404);

  const [updated] = await db
    .update(assets)
    .set({ status: status as any, updatedAt: new Date().toISOString() })
    .where(eq(assets.id, id))
    .returning();

  await db.insert(assetHistory).values({ assetId: id, action: "status_change", fromValue: existing.status, toValue: status, performedBy: user.id, notes });
  await logAudit(c.env, { userId: user.id, action: "status_change", entityType: "asset", entityId: id, details: { from: existing.status, to: status } });
  return c.json({ asset: updated });
});

app.post("/:id/maintenance", requireRole("super_admin", "campus_admin"), async (c) => {
  const id = Number(c.req.param("id"));
  const user = c.get("user");
  const body = await c.req.json<{ description: string; cost?: number; vendor?: string; performedAt: string; nextDueDate?: string }>();
  if (!body.description || !body.performedAt) return c.json({ error: "description and performedAt are required" }, 400);

  const db = drizzle(c.env.DB);
  const [record] = await db.insert(maintenanceRecords).values({ ...body, assetId: id, createdBy: user.id }).returning();
  await db.insert(assetHistory).values({ assetId: id, action: "maintenance", toValue: body.description, performedBy: user.id });
  await logAudit(c.env, { userId: user.id, action: "maintenance_logged", entityType: "asset", entityId: id });
  return c.json({ maintenance: record }, 201);
});

app.post("/:id/photo", requireRole("super_admin", "campus_admin"), async (c) => {
  const id = Number(c.req.param("id"));
  const user = c.get("user");
  const db = drizzle(c.env.DB);
  const [existing] = await db.select().from(assets).where(eq(assets.id, id)).limit(1);
  if (!existing) return c.json({ error: "Not found" }, 404);
  if (user.role === "campus_admin" && user.campusId !== existing.campusId) return c.json({ error: "Forbidden" }, 403);

  const form = await c.req.formData();
  const file = form.get("photo");
  if (!(file instanceof File)) return c.json({ error: "photo file is required" }, 400);

  const key = `assets/${id}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
  await c.env.FILES.put(key, await file.arrayBuffer(), { httpMetadata: { contentType: file.type } });

  const photoUrl = `/api/files/${key}`;
  const [updated] = await db.update(assets).set({ photoUrl, updatedAt: new Date().toISOString() }).where(eq(assets.id, id)).returning();
  await db.insert(assetHistory).values({ assetId: id, action: "updated", toValue: "photo uploaded", performedBy: user.id });
  await logAudit(c.env, { userId: user.id, action: "photo_uploaded", entityType: "asset", entityId: id });
  return c.json({ asset: updated });
});

// --- CSV export/import ---

app.post("/import/csv", requireRole("super_admin", "campus_admin"), async (c) => {
  const user = c.get("user");
  const text = await c.req.text();
  const rows = parseCsv(text);
  if (rows.length < 2) return c.json({ error: "CSV has no data rows" }, 400);

  const header = rows[0].map((h) => h.trim().toLowerCase());
  const idx = (name: string) => header.indexOf(name);
  const db = drizzle(c.env.DB);

  let imported = 0;
  const errors: string[] = [];

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (row.length === 1 && row[0] === "") continue;
    try {
      const categoryName = row[idx("category")]?.trim();
      const brand = row[idx("brand")]?.trim();
      const modelName = row[idx("model")]?.trim();
      const campusId = Number(row[idx("campus_id")]);
      if (!categoryName || !brand || !modelName || !campusId) {
        errors.push(`Row ${i + 1}: category, brand, model, and campus_id are required`);
        continue;
      }
      if (user.role === "campus_admin" && user.campusId !== campusId) {
        errors.push(`Row ${i + 1}: forbidden for campus ${campusId}`);
        continue;
      }

      let [category] = await db.select().from(categories).where(eq(categories.name, categoryName)).limit(1);
      if (!category) [category] = await db.insert(categories).values({ name: categoryName }).returning();

      let [model] = await db
        .select()
        .from(assetModels)
        .where(and(eq(assetModels.categoryId, category.id), eq(assetModels.brand, brand), eq(assetModels.modelName, modelName)))
        .limit(1);
      if (!model) [model] = await db.insert(assetModels).values({ categoryId: category.id, brand, modelName }).returning();

      const assetTag = await nextAssetTag(db);
      const locationIdRaw = row[idx("location_id")]?.trim();
      const [created] = await db
        .insert(assets)
        .values({
          assetTag,
          modelId: model.id,
          campusId,
          locationId: locationIdRaw ? Number(locationIdRaw) : undefined,
          serialNumber: row[idx("serial_number")]?.trim() || undefined,
          status: (row[idx("status")]?.trim() as any) || "available",
          assignedToName: row[idx("assigned_to_name")]?.trim() || undefined,
          purchaseDate: row[idx("purchase_date")]?.trim() || undefined,
          purchaseCost: row[idx("purchase_cost")] ? Number(row[idx("purchase_cost")]) : undefined,
          warrantyExpiry: row[idx("warranty_expiry")]?.trim() || undefined,
          createdBy: user.id,
        })
        .returning();

      await db.insert(assetHistory).values({ assetId: created.id, action: "created", performedBy: user.id, notes: "Imported via CSV" });
      imported++;
    } catch (err) {
      errors.push(`Row ${i + 1}: ${err instanceof Error ? err.message : "unknown error"}`);
    }
  }

  await logAudit(c.env, { userId: user.id, action: "csv_imported", entityType: "asset", details: { imported, errorCount: errors.length } });
  return c.json({ imported, errors });
});

app.get("/export/csv", async (c) => {
  const user = c.get("user");
  const db = drizzle(c.env.DB);
  const scopedCampusId = campusFilter(user);
  const rows = await db
    .select({ asset: assets, model: assetModels, category: categories })
    .from(assets)
    .innerJoin(assetModels, eq(assets.modelId, assetModels.id))
    .innerJoin(categories, eq(assetModels.categoryId, categories.id))
    .where(scopedCampusId !== undefined ? eq(assets.campusId, scopedCampusId) : undefined);

  const header = [
    "asset_tag",
    "serial_number",
    "category",
    "brand",
    "model",
    "status",
    "campus_id",
    "location_id",
    "assigned_to_name",
    "purchase_date",
    "purchase_cost",
    "warranty_expiry",
  ];
  const csvRows = rows.map((r) =>
    [
      r.asset.assetTag,
      r.asset.serialNumber ?? "",
      r.category.name,
      r.model.brand,
      r.model.modelName,
      r.asset.status,
      r.asset.campusId,
      r.asset.locationId ?? "",
      r.asset.assignedToName ?? "",
      r.asset.purchaseDate ?? "",
      r.asset.purchaseCost ?? "",
      r.asset.warrantyExpiry ?? "",
    ]
      .map((v) => `"${String(v).replace(/"/g, '""')}"`)
      .join(",")
  );
  const csv = [header.join(","), ...csvRows].join("\n");
  return new Response(csv, {
    headers: { "Content-Type": "text/csv", "Content-Disposition": "attachment; filename=assets-export.csv" },
  });
});

export default app;
