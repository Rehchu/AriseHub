import { Hono } from "hono";
import { cors } from "hono/cors";
import authRoutes from "./routes/auth";
import campusRoutes from "./routes/campuses";
import locationRoutes from "./routes/locations";
import categoryRoutes from "./routes/categories";
import assetRoutes from "./routes/assets";
import wifiRoutes from "./routes/wifi";
import userRoutes from "./routes/users";
import auditRoutes from "./routes/audit";
import dashboardRoutes from "./routes/dashboard";
import ticketRoutes from "./routes/tickets";
import consumableRoutes from "./routes/consumables";
import licenseRoutes from "./routes/licenses";
import fileRoutes from "./routes/files";
import publicRoutes from "./routes/public";
import guestRoutes from "./routes/guest";
import accessPassRoutes from "./routes/access-passes";
import type { Env, Variables } from "./types";

const app = new Hono<{ Bindings: Env; Variables: Variables }>();

app.use("*", async (c, next) => {
  const allowed = c.env.ALLOWED_ORIGINS.split(",").map((s) => s.trim());
  return cors({
    origin: (origin) => (allowed.includes(origin) ? origin : allowed[0]),
    credentials: true,
  })(c, next);
});

app.get("/api/health", (c) => c.json({ ok: true }));

app.route("/api/auth", authRoutes);
app.route("/api/campuses", campusRoutes);
app.route("/api/locations", locationRoutes);
app.route("/api/categories", categoryRoutes);
app.route("/api/assets", assetRoutes);
app.route("/api/wifi", wifiRoutes);
app.route("/api/users", userRoutes);
app.route("/api/audit-log", auditRoutes);
app.route("/api/dashboard", dashboardRoutes);
app.route("/api/tickets", ticketRoutes);
app.route("/api/consumables", consumableRoutes);
app.route("/api/licenses", licenseRoutes);
app.route("/api/files", fileRoutes);
app.route("/api/public", publicRoutes);
app.route("/api/guest", guestRoutes);
app.route("/api/access-passes", accessPassRoutes);

app.notFound((c) => c.json({ error: "Not found" }, 404));
app.onError((err, c) => {
  console.error(err);
  return c.json({ error: "Internal server error" }, 500);
});

export default app;
