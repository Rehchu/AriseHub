"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { visibleModules } from "@/lib/modules";
import type { Profile } from "@/lib/database.types";
import { Logo } from "@/components/Logo";
import { Icon } from "./Icon";
import { GetITHelp } from "./GetITHelp";
import { RegisterServiceWorker } from "@/components/pwa/RegisterServiceWorker";
import { NotificationToggle } from "@/components/pwa/NotificationToggle";
import { InstallPrompt } from "@/components/pwa/InstallPrompt";
import { GlobalSearch } from "./GlobalSearch";
import { ITPortalLink } from "./ITPortalLink";
import { ThemeToggle } from "./ThemeToggle";
import { BottomNav, bottomNavItems } from "./BottomNav";

const IT_PORTAL =
  process.env.NEXT_PUBLIC_IT_PORTAL_URL ?? "https://itportal.myfaithtech.com";

export function Shell({
  profile,
  email,
  isIT = false,
  canCare = false,
  children,
}: {
  profile: Profile | null;
  email: string;
  isIT?: boolean;
  canCare?: boolean;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createClient();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);

  // Care is grant-based, not role-based, so filter it separately.
  const modules = visibleModules(profile?.role).filter(
    (m) => m.key !== "care" || canCare,
  );
  const displayName = profile?.full_name || email;

  async function signOut() {
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  const bottomItems = bottomNavItems(modules);
  const bottomKeys = new Set(bottomItems.map((m) => m.key));

  // `hideBottomNavItems` is for the phone drawer: no point listing Messages
  // twice when it is already a thumb-tap away at the bottom of the screen.
  const navList = (hideBottomNavItems = false) => (
    <nav className="flex-1 space-y-1 px-3">
      {modules
        .filter((m) => !(hideBottomNavItems && bottomKeys.has(m.key)))
        .map((m) => {
        const active =
          pathname === m.href || pathname.startsWith(m.href + "/");
        // IT staff jump straight into the portal instead of the self-help page.
        if (m.key === "it" && isIT) {
          return <ITPortalLink key={m.key} onNavigate={() => setDrawerOpen(false)} />;
        }
        return (
          <Link
            key={m.key}
            href={m.ready ? m.href : "#"}
            onClick={() => setDrawerOpen(false)}
            aria-disabled={!m.ready}
            className={`group flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition ${
              active
                ? "bg-brand-500 text-chrome-50"
                : "text-chrome-200 hover:bg-chrome-700 hover:text-chrome-50"
            } ${m.ready ? "" : "cursor-default opacity-50"}`}
          >
            <Icon name={m.icon} />
            <span className="flex-1">{m.label}</span>
            {!m.ready && (
              <span className="rounded bg-chrome-700 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-chrome-300">
                Soon
              </span>
            )}
          </Link>
        );
        })}
    </nav>
  );

  return (
    <div className="flex h-[100dvh] overflow-hidden bg-ink-50">
      <RegisterServiceWorker />
      {/* Desktop sidebar */}
      <aside className="hidden w-64 shrink-0 flex-col bg-chrome-900 py-5 lg:flex">
        <div className="mb-6 flex items-center gap-2.5 px-5 text-chrome-50">
          <Logo size={30} />
          <span className="font-display text-lg font-bold">
            Arise<span className="text-brand-500">Hub</span>
          </span>
        </div>
        {navList()}
        <SidebarFooter name={displayName} role={profile?.role} profileId={profile?.id} onSignOut={signOut} />
      </aside>

      {/* Mobile drawer */}
      {drawerOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setDrawerOpen(false)}
          />
          <aside className="absolute left-0 top-0 flex h-full w-64 flex-col bg-chrome-900 pb-5 pt-[max(1.25rem,env(safe-area-inset-top))]">
            <div className="mb-6 flex items-center justify-between px-5 text-chrome-50">
              <span className="flex items-center gap-2.5">
                <Logo size={28} />
                <span className="font-display font-bold">AriseHub</span>
              </span>
              <button onClick={() => setDrawerOpen(false)} className="text-chrome-300">
                <Icon name="x" />
              </button>
            </div>
            {navList(true)}
            <SidebarFooter name={displayName} role={profile?.role} profileId={profile?.id} onSignOut={signOut} />
          </aside>
        </div>
      )}

      {/* Main column */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex min-h-18 shrink-0 items-center gap-2 border-b border-ink-100 bg-white px-3 pt-safe safe-x lg:min-h-14 lg:gap-3 lg:px-4">
          <button
            onClick={() => setDrawerOpen(true)}
            className="-ml-1 flex h-12 w-12 shrink-0 items-center justify-center rounded-xl text-ink-700 active:bg-ink-100 lg:hidden"
            aria-label="Open menu"
          >
            <Icon name="menu" size={28} />
          </button>
          <div className="flex items-center gap-2 lg:hidden">
            <Logo size={30} />
            <span className="font-display text-lg font-bold">AriseHub</span>
          </div>
          <div className="flex-1" />
          <GlobalSearch />
          {!isIT && (
          <button
            onClick={() => setHelpOpen(true)}
            className="flex h-11 shrink-0 items-center gap-2 rounded-xl bg-brand-500 px-3 text-sm font-semibold text-chrome-50 transition hover:bg-brand-600 lg:h-9"
          >
            <Icon name="help" size={18} />
            <span className="hidden sm:inline">Get IT Help</span>
          </button>
          )}
        </header>

        {/* pb-16 clears the fixed bottom bar on phones. */}
        <main className="flex-1 overflow-y-auto pb-16 lg:pb-0">{children}</main>
      </div>

      {helpOpen && (
        <GetITHelp profile={profile} email={email} onClose={() => setHelpOpen(false)} />
      )}
      <BottomNav
        items={bottomItems}
        onMore={() => setDrawerOpen(true)}
        moreActive={drawerOpen}
      />
      <InstallPrompt />
    </div>
  );
}

function SidebarFooter({
  name,
  role,
  profileId,
  onSignOut,
}: {
  name: string;
  role?: string;
  profileId?: string;
  onSignOut: () => void;
}) {
  return (
    <div className="mt-4 border-t border-chrome-700 px-3 pt-4">
      <div className="mb-2 px-2">
        <p className="truncate text-sm font-medium text-chrome-50">{name}</p>
        <p className="text-xs text-chrome-400">{role?.replace("_", " ") ?? "Member"}</p>
      </div>
      <a
        href="/account/profile"
        className="flex min-h-11 w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-chrome-200 transition hover:bg-chrome-700 hover:text-chrome-50"
      >
        <Icon name="badge" />
        My profile
      </a>
      <a
        href="/account/notifications"
        className="flex min-h-11 w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-chrome-200 transition hover:bg-chrome-700 hover:text-chrome-50"
      >
        <Icon name="help" />
        Notifications
      </a>
      <ThemeToggle />
      <button
        onClick={onSignOut}
        className="flex min-h-11 w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-chrome-200 transition hover:bg-chrome-700 hover:text-chrome-50"
      >
        <Icon name="logout" />
        Sign out
      </button>
    </div>
  );
}
