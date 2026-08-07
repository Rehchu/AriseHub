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

// Browser hardening. This portal holds WiFi passwords and asset records, so it
// must never be frameable and must not leak its URLs to other sites.
app.use("*", async (c, next) => {
  await next();
  c.header("X-Frame-Options", "DENY");
  c.header("Content-Security-Policy", "frame-ancestors 'none'");
  c.header("X-Content-Type-Options", "nosniff");
  c.header("Referrer-Policy", "strict-origin-when-cross-origin");
  c.header("Permissions-Policy", "geolocation=(), microphone=(), payment=(), usb=()");
  c.header("Cross-Origin-Opener-Policy", "same-origin");
  c.header("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
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

// Anything that is not an API call is the SPA — hand it to the assets binding.
app.notFound(async (c) => {
  if (c.req.path.startsWith("/api/")) return c.json({ error: "Not found" }, 404);
  return c.env.ASSETS.fetch(c.req.raw);
});
app.onError((err, c) => {
  console.error(err);
  return c.json({ error: "Internal server error" }, 500);
});

export default app;
