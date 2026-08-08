import type { UserRole } from "@/lib/database.types";
import { CHECKIN_ROLES } from "@/lib/roles";

export type ModuleKey =
  | "dashboard"
  | "people"
  | "checkins"
  | "forms"
  | "care"
  | "reports"
  | "groups"
  | "calendar"
  | "services"
  | "messages"
  | "tasks"
  | "it"
  | "ideas"
  | "admin";

export interface ModuleDef {
  key: ModuleKey;
  label: string;
  href: string;
  icon: string; // key into the Icon component
  // Roles allowed to see the module. Empty = everyone.
  roles?: UserRole[];
  // Muted per-module accent (Planning-Center style).
  accent: string;
  ready: boolean; // built in Phase 3, vs. a "coming soon" placeholder
}

export const MODULES: ModuleDef[] = [
  { key: "dashboard", label: "Dashboard", href: "/dashboard", icon: "home", accent: "#d2303b", ready: true },
  { key: "messages", label: "Messages", href: "/messages", icon: "chat", accent: "#2563eb", ready: true },
  { key: "tasks", label: "Tasks", href: "/tasks", icon: "task", accent: "#0891b2", ready: true },
  { key: "people", label: "People", href: "/people", icon: "users", accent: "#7c3aed", ready: true },
  // Must match public.is_checkin_role(), or the menu offers a page whose
  // queries RLS refuses — or hides one somebody is entitled to work on.
  { key: "checkins", label: "Check-Ins", href: "/checkins", icon: "badge", accent: "#0891b2", ready: true, roles: CHECKIN_ROLES },
  { key: "forms", label: "Forms", href: "/forms", icon: "form", accent: "#0d9488", ready: true, roles: ["Super_Admin", "IT_Admin", "Staff"] },
  // Visibility is decided by is_pastoral() in the Shell, not by role.
  { key: "care", label: "Care", href: "/care", icon: "heart", accent: "#be123c", ready: true },
  { key: "reports", label: "Reports", href: "/reports", icon: "chart", accent: "#0f766e", ready: true, roles: ["Super_Admin", "Staff"] },
  { key: "groups", label: "Groups", href: "/groups", icon: "group", accent: "#059669", ready: true },
  { key: "calendar", label: "Calendar", href: "/calendar", icon: "calendar", accent: "#d97706", ready: true },
  { key: "services", label: "Services", href: "/services", icon: "music", accent: "#db2777", ready: true },
  // IT: the IT team goes straight to the portal (Shell rewrites the href);
  // everyone else lands on a self-service help page.
  { key: "it", label: "IT Support", href: "/it", icon: "wrench", accent: "#4b5563", ready: true },
  { key: "ideas", label: "Ideas", href: "/ideas", icon: "chart", accent: "#7c3aed", ready: true },
  { key: "admin", label: "Admin", href: "/admin/departments", icon: "wrench", accent: "#d2303b", ready: true, roles: ["Super_Admin"] },
];

export function visibleModules(role: UserRole | undefined): ModuleDef[] {
  return MODULES.filter((m) => !m.roles || (role && m.roles.includes(role)));
}
