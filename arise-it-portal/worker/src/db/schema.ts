import { sqliteTable, text, integer, real, uniqueIndex, index } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

const timestamps = {
  createdAt: text("created_at").notNull().default(sql`(CURRENT_TIMESTAMP)`),
};

export const campuses = sqliteTable("campuses", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  address: text("address"),
  timezone: text("timezone"),
  notes: text("notes"),
  ...timestamps,
});

export const locations = sqliteTable("locations", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  campusId: integer("campus_id").notNull().references(() => campuses.id),
  name: text("name").notNull(),
  description: text("description"),
  ...timestamps,
}, (t) => ({
  campusIdx: index("locations_campus_idx").on(t.campusId),
}));

export const users = sqliteTable("users", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  email: text("email").notNull(),
  passwordHash: text("password_hash").notNull(),
  passwordSalt: text("password_salt").notNull(),
  role: text("role", { enum: ["super_admin", "campus_admin", "viewer"] }).notNull().default("viewer"),
  campusId: integer("campus_id").references(() => campuses.id),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  mustChangePassword: integer("must_change_password", { mode: "boolean" }).notNull().default(true),
  lastLoginAt: text("last_login_at"),
  ...timestamps,
}, (t) => ({
  emailUnique: uniqueIndex("users_email_unique").on(t.email),
}));

export const sessions = sqliteTable("sessions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id").notNull().references(() => users.id),
  tokenHash: text("token_hash").notNull(),
  expiresAt: text("expires_at").notNull(),
  ...timestamps,
}, (t) => ({
  tokenIdx: uniqueIndex("sessions_token_idx").on(t.tokenHash),
}));

export const categories = sqliteTable("categories", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  icon: text("icon"),
  ...timestamps,
}, (t) => ({
  nameUnique: uniqueIndex("categories_name_unique").on(t.name),
}));

export const assetModels = sqliteTable("asset_models", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  categoryId: integer("category_id").notNull().references(() => categories.id),
  brand: text("brand").notNull(),
  modelName: text("model_name").notNull(),
  specs: text("specs"),
  ...timestamps,
}, (t) => ({
  categoryIdx: index("asset_models_category_idx").on(t.categoryId),
}));

export const assets = sqliteTable("assets", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  assetTag: text("asset_tag").notNull(),
  serialNumber: text("serial_number"),
  modelId: integer("model_id").notNull().references(() => assetModels.id),
  campusId: integer("campus_id").notNull().references(() => campuses.id),
  locationId: integer("location_id").references(() => locations.id),
  status: text("status", {
    enum: ["available", "checked_out", "in_repair", "retired", "lost"],
  }).notNull().default("available"),
  assignedToUserId: integer("assigned_to_user_id").references(() => users.id),
  assignedToName: text("assigned_to_name"),
  purchaseDate: text("purchase_date"),
  purchaseCost: real("purchase_cost"),
  warrantyExpiry: text("warranty_expiry"),
  photoUrl: text("photo_url"),
  notes: text("notes"),
  createdBy: integer("created_by").references(() => users.id),
  updatedAt: text("updated_at").notNull().default(sql`(CURRENT_TIMESTAMP)`),
  ...timestamps,
}, (t) => ({
  tagUnique: uniqueIndex("assets_tag_unique").on(t.assetTag),
  serialIdx: index("assets_serial_idx").on(t.serialNumber),
  campusIdx: index("assets_campus_idx").on(t.campusId),
  statusIdx: index("assets_status_idx").on(t.status),
}));

export const assetHistory = sqliteTable("asset_history", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  assetId: integer("asset_id").notNull().references(() => assets.id),
  action: text("action", {
    enum: ["created", "updated", "checked_out", "checked_in", "status_change", "maintenance"],
  }).notNull(),
  fromValue: text("from_value"),
  toValue: text("to_value"),
  performedBy: integer("performed_by").references(() => users.id),
  notes: text("notes"),
  ...timestamps,
}, (t) => ({
  assetIdx: index("asset_history_asset_idx").on(t.assetId),
}));

export const maintenanceRecords = sqliteTable("maintenance_records", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  assetId: integer("asset_id").notNull().references(() => assets.id),
  description: text("description").notNull(),
  cost: real("cost"),
  vendor: text("vendor"),
  performedAt: text("performed_at").notNull(),
  nextDueDate: text("next_due_date"),
  createdBy: integer("created_by").references(() => users.id),
  ...timestamps,
}, (t) => ({
  assetIdx: index("maintenance_asset_idx").on(t.assetId),
  dueIdx: index("maintenance_due_idx").on(t.nextDueDate),
}));

export const wifiNetworks = sqliteTable("wifi_networks", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  campusId: integer("campus_id").notNull().references(() => campuses.id),
  locationId: integer("location_id").references(() => locations.id),
  ssid: text("ssid").notNull(),
  passwordEncrypted: text("password_encrypted").notNull(),
  securityType: text("security_type").notNull().default("WPA2"),
  band: text("band"),
  vlan: text("vlan"),
  isGuest: integer("is_guest", { mode: "boolean" }).notNull().default(false),
  notes: text("notes"),
  updatedBy: integer("updated_by").references(() => users.id),
  updatedAt: text("updated_at").notNull().default(sql`(CURRENT_TIMESTAMP)`),
  ...timestamps,
}, (t) => ({
  campusIdx: index("wifi_campus_idx").on(t.campusId),
}));

export const tickets = sqliteTable("tickets", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  subject: text("subject").notNull(),
  description: text("description"),
  // Null for tickets submitted via the public no-account form; requesterName
  // then carries the submitter's typed name (requesterEmail optional).
  requesterUserId: integer("requester_user_id").references(() => users.id),
  requesterName: text("requester_name"),
  requesterEmail: text("requester_email"),
  campusId: integer("campus_id").notNull().references(() => campuses.id),
  category: text("category", {
    enum: ["hardware", "software", "network", "account", "other"],
  }).notNull().default("other"),
  priority: text("priority", { enum: ["urgent", "high", "medium", "low"] }).notNull().default("medium"),
  status: text("status", {
    enum: ["open", "in_progress", "waiting", "resolved", "closed"],
  }).notNull().default("open"),
  assignedToUserId: integer("assigned_to_user_id").references(() => users.id),
  dueAt: text("due_at"),
  updatedAt: text("updated_at").notNull().default(sql`(CURRENT_TIMESTAMP)`),
  ...timestamps,
}, (t) => ({
  campusIdx: index("tickets_campus_idx").on(t.campusId),
  statusIdx: index("tickets_status_idx").on(t.status),
  assignedIdx: index("tickets_assigned_idx").on(t.assignedToUserId),
}));

export const ticketComments = sqliteTable("ticket_comments", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  ticketId: integer("ticket_id").notNull().references(() => tickets.id),
  userId: integer("user_id").notNull().references(() => users.id),
  body: text("body").notNull(),
  ...timestamps,
}, (t) => ({
  ticketIdx: index("ticket_comments_ticket_idx").on(t.ticketId),
}));

export const consumables = sqliteTable("consumables", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  category: text("category"),
  campusId: integer("campus_id").notNull().references(() => campuses.id),
  quantityOnHand: integer("quantity_on_hand").notNull().default(0),
  reorderThreshold: integer("reorder_threshold").notNull().default(0),
  notes: text("notes"),
  updatedAt: text("updated_at").notNull().default(sql`(CURRENT_TIMESTAMP)`),
  ...timestamps,
}, (t) => ({
  campusIdx: index("consumables_campus_idx").on(t.campusId),
}));

export const softwareLicenses = sqliteTable("software_licenses", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  vendor: text("vendor"),
  campusId: integer("campus_id").references(() => campuses.id),
  seatsTotal: integer("seats_total").notNull().default(1),
  renewalDate: text("renewal_date"),
  cost: real("cost"),
  notes: text("notes"),
  updatedAt: text("updated_at").notNull().default(sql`(CURRENT_TIMESTAMP)`),
  ...timestamps,
}, (t) => ({
  campusIdx: index("licenses_campus_idx").on(t.campusId),
  renewalIdx: index("licenses_renewal_idx").on(t.renewalDate),
}));

export const licenseAssignments = sqliteTable("license_assignments", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  licenseId: integer("license_id").notNull().references(() => softwareLicenses.id),
  assignedToUserId: integer("assigned_to_user_id").notNull().references(() => users.id),
  ...timestamps,
}, (t) => ({
  licenseIdx: index("license_assignments_license_idx").on(t.licenseId),
  uniqueAssignment: uniqueIndex("license_assignments_unique").on(t.licenseId, t.assignedToUserId),
}));

export const accessPasses = sqliteTable("access_passes", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  label: text("label").notNull(),
  codeHash: text("code_hash").notNull(),
  scope: text("scope", { enum: ["equipment", "wifi"] }).notNull(),
  campusId: integer("campus_id").notNull().references(() => campuses.id),
  // For wifi-scope passes: false = guest networks only (secure default);
  // true = all networks at the campus (e.g. a Leadership pass).
  wifiAllNetworks: integer("wifi_all_networks", { mode: "boolean" }).notNull().default(false),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  createdBy: integer("created_by").references(() => users.id),
  lastUsedAt: text("last_used_at"),
  ...timestamps,
}, (t) => ({
  codeIdx: uniqueIndex("access_passes_code_idx").on(t.codeHash),
}));

export const auditLog = sqliteTable("audit_log", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id").references(() => users.id),
  action: text("action").notNull(),
  entityType: text("entity_type").notNull(),
  entityId: integer("entity_id"),
  details: text("details"),
  ipAddress: text("ip_address"),
  ...timestamps,
}, (t) => ({
  entityIdx: index("audit_entity_idx").on(t.entityType, t.entityId),
  userIdx: index("audit_user_idx").on(t.userId),
}));
