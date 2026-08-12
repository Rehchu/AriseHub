import type { UserRole } from "@/lib/database.types";
import { mayRunCheckin } from "@/lib/roles";

export type ModuleKey =
  | "dashboard"
  | "people"
  | "checkins"
  | "forms"
  | "reports"
  | "groups"
  | "calendar"
  | "services"
  | "messages"
  | "tasks"
  | "it"
  | "ideas"
  | "bible"
  | "sermons"
  | "announcements"
  | "prayer"
  | "admin";

export interface ModuleDef {
  key: ModuleKey;
  label: string;
  href: string;
  icon: string; // key into the Icon component
  // Roles allowed to see the module. Empty = everyone.
  roles?: UserRole[];
  /** For rules a role list cannot express — check-in depends on department. */
  showIf?: (role: UserRole | undefined) => boolean;
  // Muted per-module accent (Planning-Center style).
  accent: string;
  ready: boolean; // built in Phase 3, vs. a "coming soon" placeholder
  /**
   * Core areas stay top-level in the sidebar; the rest collapse into "More"
   * (design handoff: 14 flat items became 5 areas + an overflow). Every route
   * survives — this is visual demotion, not removal.
   */
  core?: boolean;
}

export const MODULES: ModuleDef[] = [
  { key: "dashboard", label: "Home", href: "/dashboard", icon: "home", accent: "#d2303b", ready: true, core: true },
  { key: "messages", label: "Messages", href: "/messages", icon: "chat", accent: "#2563eb", ready: true, core: true },
  { key: "tasks", label: "Tasks", href: "/tasks", icon: "task", accent: "#0891b2", ready: true },
  { key: "people", label: "People", href: "/people", icon: "users", accent: "#7c3aed", ready: true, core: true },
  // Check-in access depends on DEPARTMENT as well as role (0064), and this menu
  // only knows the role — so it errs generous and lets the page do the real
  // check against is_checkin_role(). Offering a nav item to somebody the page
  // then redirects is a small annoyance; hiding it from the volunteer who needs
  // it on a Sunday morning is not.
  { key: "checkins", label: "Check-Ins", href: "/checkins", icon: "badge", accent: "#0891b2", ready: true, showIf: mayRunCheckin, core: true },
  { key: "forms", label: "Forms", href: "/forms", icon: "form", accent: "#0d9488", ready: true, roles: ["Super_Admin", "IT_Admin", "Staff"] },
  { key: "reports", label: "Reports", href: "/reports", icon: "chart", accent: "#0f766e", ready: true, roles: ["Super_Admin", "Staff"] },
  { key: "groups", label: "Groups", href: "/groups", icon: "group", accent: "#059669", ready: true },
  { key: "calendar", label: "Calendar", href: "/calendar", icon: "calendar", accent: "#d97706", ready: true },
  { key: "services", label: "Services", href: "/services", icon: "music", accent: "#db2777", ready: true, core: true },
  // IT: the IT team goes straight to the portal (Shell rewrites the href);
  // everyone else lands on a self-service help page.
  { key: "it", label: "IT Support", href: "/it", icon: "wrench", accent: "#4b5563", ready: true },
  { key: "ideas", label: "Ideas", href: "/ideas", icon: "chart", accent: "#7c3aed", ready: true },
  // Everyone can read the Bible — no roles gate.
  { key: "bible", label: "Bible", href: "/bible", icon: "book", accent: "#4f46e5", ready: true },
  // Past messages. Congregation-wide: RLS only returns published ones to
  // everyone else, so the page is safe without a role gate here.
  { key: "sermons", label: "Sermons", href: "/services/archive", icon: "play", accent: "#0369a1", ready: true },
  { key: "announcements", label: "Announcements", href: "/announcements", icon: "chat", accent: "#ea580c", ready: true },
  // Anyone can ask for prayer; RLS keeps requests with the prayer team.
  { key: "prayer", label: "Prayer", href: "/prayer", icon: "heart", accent: "#be123c", ready: true },
  // /admin, not /admin/departments: the index routes each role to its own
  // entry page, and prefix-matching on /admin keeps the nav item lit on every
  // admin tab. IT_Admin and Staff belong in the gate — the layout already
  // admits them (Elvanto and Rooms respectively); a page someone can only
  // reach by typing the URL is not "in the app".
  { key: "admin", label: "Admin", href: "/admin", icon: "wrench", accent: "#d2303b", ready: true, roles: ["Super_Admin", "IT_Admin", "Staff"] },
];

export function visibleModules(role: UserRole | undefined): ModuleDef[] {
  return MODULES.filter((m) => {
    if (m.showIf) return m.showIf(role);
    return !m.roles || (role && m.roles.includes(role));
  });
}
