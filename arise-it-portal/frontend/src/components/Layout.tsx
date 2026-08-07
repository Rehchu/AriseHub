import { useEffect, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import {
  LayoutDashboard,
  Boxes,
  Wifi,
  Building2,
  Tags,
  Users as UsersIcon,
  ScrollText,
  Ticket,
  LogOut,
  Menu,
  X,
  Sun,
  Moon,
  Package,
  KeyRound,
  QrCode,
  ArrowLeft,
} from "lucide-react";
import { useAuth } from "../lib/auth-context";
import { useTheme } from "../lib/theme-context";
import GlobalSearch from "./GlobalSearch";
import { LogoMark } from "./Logo";

const navItems = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard, roles: ["super_admin", "campus_admin", "viewer"] },
  { to: "/requests", label: "Requests", icon: Ticket, roles: ["super_admin", "campus_admin", "viewer"] },
  { to: "/assets", label: "Assets", icon: Boxes, roles: ["super_admin", "campus_admin", "viewer"] },
  { to: "/consumables", label: "Consumables", icon: Package, roles: ["super_admin", "campus_admin", "viewer"] },
  { to: "/licenses", label: "Software Licenses", icon: KeyRound, roles: ["super_admin", "campus_admin", "viewer"] },
  { to: "/wifi", label: "WiFi Vault", icon: Wifi, roles: ["super_admin", "campus_admin", "viewer"] },
  { to: "/campuses", label: "Campuses & Locations", icon: Building2, roles: ["super_admin", "campus_admin"] },
  { to: "/categories", label: "Categories & Models", icon: Tags, roles: ["super_admin", "campus_admin"] },
  { to: "/users", label: "Users", icon: UsersIcon, roles: ["super_admin"] },
  { to: "/access-passes", label: "Quick Access", icon: QrCode, roles: ["super_admin"] },
  { to: "/audit-log", label: "Audit Log", icon: ScrollText, roles: ["super_admin", "campus_admin"] },
];

// Cross-links into AriseHub. Password resets live there because Supabase Auth
// does — duplicating the service-role key into this worker would widen the
// blast radius for no benefit.
const ARISEHUB = "https://arisehub.myfaithtech.com";
const externalItems = [
  {
    href: ARISEHUB + "/it/passwords",
    label: "AriseHub Passwords",
    icon: KeyRound,
    roles: ["super_admin", "campus_admin"],
  },
  {
    href: ARISEHUB + "/dashboard",
    label: "Back to AriseHub",
    icon: ArrowLeft,
    roles: ["super_admin", "campus_admin", "viewer"],
  },
];

export default function Layout() {
  const { user, logout } = useAuth();
  const { theme, toggle } = useTheme();
  const navigate = useNavigate();
  const location = useLocation();
  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => {
    setDrawerOpen(false);
  }, [location.pathname]);

  if (!user) return null;

  const initials = user.name
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <div className="min-h-screen flex bg-gray-50 dark:bg-ink-950">
      {drawerOpen && (
        <div className="fixed inset-0 bg-black/40 z-30 lg:hidden" onClick={() => setDrawerOpen(false)} />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-40 w-64 bg-ink-900 text-ink-100 flex flex-col transition-transform duration-200 lg:static lg:translate-x-0 ${
          drawerOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="px-5 py-5 flex items-center justify-between gap-2 border-b border-white/10">
          <div className="flex items-center gap-2">
            <LogoMark size={34} />
            <div className="font-display font-bold text-white tracking-wide text-sm leading-tight">
              ARISE IT
              <div className="text-[10px] font-sans font-normal text-ink-300 tracking-wider">PORTAL</div>
            </div>
          </div>
          <button aria-label="Close menu" className="lg:hidden text-ink-300 hover:text-white" onClick={() => setDrawerOpen(false)}>
            <X size={20} />
          </button>
        </div>
        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {navItems
            .filter((item) => item.roles.includes(user.role))
            .map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === "/"}
                className={({ isActive }) =>
                  `flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${
                    isActive ? "bg-brand-500 text-white font-medium" : "text-ink-200 hover:bg-ink-800 hover:text-white"
                  }`
                }
              >
                <item.icon size={17} strokeWidth={2} />
                {item.label}
              </NavLink>
            ))}

          <div className="my-2 border-t border-white/10" />
          {externalItems
            .filter((item) => item.roles.includes(user.role))
            .map((item) => (
              <a
                key={item.href}
                href={item.href}
                className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-ink-200 transition-colors hover:bg-ink-800 hover:text-white"
              >
                <item.icon size={17} strokeWidth={2} />
                {item.label}
              </a>
            ))}
        </nav>
        <div className="p-3 border-t border-white/10">
          <NavLink to="/profile" className="flex items-center gap-2 rounded-lg px-2 py-2 hover:bg-ink-800">
            <div className="w-8 h-8 rounded-full bg-brand-600 flex items-center justify-center text-xs font-semibold text-white">
              {initials}
            </div>
            <div className="text-sm">
              <div className="text-white leading-tight">{user.name}</div>
              <div className="text-ink-400 text-xs leading-tight">{user.role.replace("_", " ")}</div>
            </div>
          </NavLink>
          <button
            onClick={async () => {
              await logout();
              navigate("/login");
            }}
            className="w-full flex items-center gap-2 text-left px-2 py-2 mt-1 text-sm text-ink-300 hover:bg-ink-800 hover:text-white rounded-lg"
          >
            <LogOut size={16} />
            Log out
          </button>
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0">
        <header className="sticky top-0 z-20 bg-white dark:bg-ink-900 border-b dark:border-ink-700 px-4 py-2.5 flex items-center gap-3">
          <button aria-label="Open menu" className="lg:hidden text-gray-500 dark:text-ink-300" onClick={() => setDrawerOpen(true)}>
            <Menu size={22} />
          </button>
          <GlobalSearch />
          <button
            onClick={toggle}
            className="ml-auto text-gray-500 dark:text-ink-300 hover:text-brand-500 p-1.5 rounded-lg"
            title="Toggle dark mode"
            aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
          >
            {theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
          </button>
        </header>
        <main className="flex-1 p-4 sm:p-6 overflow-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
