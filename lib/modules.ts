import type { UserRole } from "@/lib/database.types";

export type ModuleKey =
  | "dashboard"
  | "people"
  | "checkins"
  | "groups"
  | "calendar"
  | "services"
  | "messages"
  | "tasks"
  | "it"
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
  { key: "checkins", label: "Check-Ins", href: "/checkins", icon: "badge", accent: "#0891b2", ready: false, roles: ["Super_Admin", "IT_Admin", "Staff"] },
  { key: "groups", label: "Groups", href: "/groups", icon: "group", accent: "#059669", ready: true },
  { key: "calendar", label: "Calendar", href: "/calendar", icon: "calendar", accent: "#d97706", ready: false },
  { key: "services", label: "Services", href: "/services", icon: "music", accent: "#db2777", ready: false },
  { key: "it", label: "IT Portal", href: "/it", icon: "wrench", accent: "#4b5563", ready: false },
  { key: "admin", label: "Admin", href: "/admin/departments", icon: "wrench", accent: "#d2303b", ready: true, roles: ["Super_Admin"] },
];

export function visibleModules(role: UserRole | undefined): ModuleDef[] {
  return MODULES.filter((m) => !m.roles || (role && m.roles.includes(role)));
}
