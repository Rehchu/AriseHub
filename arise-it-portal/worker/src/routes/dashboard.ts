import { Hono } from "hono";
import { drizzle } from "drizzle-orm/d1";
import { sql, eq, lte, and, isNotNull, isNull, ne } from "drizzle-orm";
import { assets, maintenanceRecords, campuses, categories, assetModels, tickets, users, consumables, softwareLicenses } from "../db/schema";
import { requireAuth, campusFilter } from "../lib/auth-middleware";
import type { Env, Variables } from "../types";

const app = new Hono<{ Bindings: Env; Variables: Variables }>();
app.use("*", requireAuth);

app.get("/", async (c) => {
  const user = c.get("user");
  const db = drizzle(c.env.DB);
  const scopedCampusId = campusFilter(user);
  const campusWhere = scopedCampusId !== undefined ? eq(assets.campusId, scopedCampusId) : undefined;

  const [totalRow] = await db.select({ count: sql<number>`count(*)` }).from(assets).where(campusWhere);

  const byStatus = await db
    .select({ status: assets.status, count: sql<number>`count(*)` })
    .from(assets)
    .where(campusWhere)
    .groupBy(assets.status);

  const byCategory = await db
    .select({ category: categories.name, count: sql<number>`count(*)` })
    .from(assets)
    .innerJoin(assetModels, eq(assets.modelId, assetModels.id))
    .innerJoin(categories, eq(assetModels.categoryId, categories.id))
    .where(campusWhere)
    .groupBy(categories.name);

  const byCampus = await db
    .select({ campus: campuses.name, count: sql<number>`count(*)` })
    .from(assets)
    .innerJoin(campuses, eq(assets.campusId, campuses.id))
    .where(campusWhere)
    .groupBy(campuses.name);

  const in90Days = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const warrantyExpiringSoon = await db
    .select()
    .from(assets)
    .where(and(campusWhere, isNotNull(assets.warrantyExpiry), lte(assets.warrantyExpiry, in90Days)));

  const maintenanceDueSoon = await db
    .select({ record: maintenanceRecords, asset: assets })
    .from(maintenanceRecords)
    .innerJoin(assets, eq(maintenanceRecords.assetId, assets.id))
    .where(and(campusWhere, isNotNull(maintenanceRecords.nextDueDate), lte(maintenanceRecords.nextDueDate, in90Days)));

  const ticketCampusWhere = scopedCampusId !== undefined ? eq(tickets.campusId, scopedCampusId) : undefined;
  const openTicketWhere = and(ticketCampusWhere, ne(tickets.status, "resolved"), ne(tickets.status, "closed"));

  // "Waiting for me": requests this user submitted that are still open (they're waiting on IT).
  const [waitingForMeRow] = await db
    .select({ count: sql<number>`count(*)` })
    .from(tickets)
    .where(and(openTicketWhere, eq(tickets.requesterUserId, user.id)));

  // "Assigned to me": tickets this user (as IT staff) is actively working.
  const [assignedToMeRow] = await db
    .select({ count: sql<number>`count(*)` })
    .from(tickets)
    .where(and(openTicketWhere, eq(tickets.assignedToUserId, user.id)));

  const [unassignedRow] = await db
    .select({ count: sql<number>`count(*)` })
    .from(tickets)
    .where(and(openTicketWhere, isNull(tickets.assignedToUserId)));

  const now = new Date().toISOString();
  const [dueSoonRow] = await db
    .select({ count: sql<number>`count(*)` })
    .from(tickets)
    .where(and(openTicketWhere, isNotNull(tickets.dueAt), lte(tickets.dueAt, now)));

  const recentTicketRows = await db
    .select({ ticket: tickets, requesterName: sql<string>`coalesce(${users.name}, ${tickets.requesterName}, 'Unknown')` })
    .from(tickets)
    .leftJoin(users, eq(tickets.requesterUserId, users.id))
    .where(ticketCampusWhere)
    .orderBy(sql`${tickets.createdAt} desc`)
    .limit(5);
  const recentTickets = recentTicketRows.map((r) => ({ ...r.ticket, requesterName: r.requesterName }));

  const consumablesCampusWhere = scopedCampusId !== undefined ? eq(consumables.campusId, scopedCampusId) : undefined;
  const allConsumables = await db.select().from(consumables).where(consumablesCampusWhere);
  const lowStockConsumables = allConsumables.filter((c) => c.quantityOnHand <= c.reorderThreshold);

  const licensesCampusWhere = scopedCampusId !== undefined ? eq(softwareLicenses.campusId, scopedCampusId) : undefined;
  const licensesRenewingSoon = await db
    .select()
    .from(softwareLicenses)
    .where(and(licensesCampusWhere, isNotNull(softwareLicenses.renewalDate), lte(softwareLicenses.renewalDate, in90Days)));

  return c.json({
    totalAssets: totalRow.count,
    byStatus,
    byCategory,
    byCampus,
    warrantyExpiringSoon,
    maintenanceDueSoon: maintenanceDueSoon.map((r) => ({ ...r.record, asset: r.asset })),
    lowStockConsumables,
    licensesRenewingSoon,
    tickets: {
      waitingForMe: waitingForMeRow.count,
      assignedToMe: assignedToMeRow.count,
      unassigned: unassignedRow.count,
      dueSoon: dueSoonRow.count,
      recent: recentTickets,
    },
  });
});

export default app;
