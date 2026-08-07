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

  const nav = (
    <nav className="flex-1 space-y-1 px-3">
      {modules.map((m) => {
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
                ? "bg-brand-500 text-white"
                : "text-ink-200 hover:bg-ink-700 hover:text-white"
            } ${m.ready ? "" : "cursor-default opacity-50"}`}
          >
            <Icon name={m.icon} />
            <span className="flex-1">{m.label}</span>
            {!m.ready && (
              <span className="rounded bg-ink-700 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-ink-300">
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
      <aside className="hidden w-64 shrink-0 flex-col bg-ink-900 py-5 lg:flex">
        <div className="mb-6 flex items-center gap-2.5 px-5 text-white">
          <Logo size={30} />
          <span className="font-display text-lg font-bold">
            Arise<span className="text-brand-500">Hub</span>
          </span>
        </div>
        {nav}
        <SidebarFooter name={displayName} role={profile?.role} profileId={profile?.id} onSignOut={signOut} />
      </aside>

      {/* Mobile drawer */}
      {drawerOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setDrawerOpen(false)}
          />
          <aside className="absolute left-0 top-0 flex h-full w-64 flex-col bg-ink-900 pb-5 pt-[max(1.25rem,env(safe-area-inset-top))]">
            <div className="mb-6 flex items-center justify-between px-5 text-white">
              <span className="flex items-center gap-2.5">
                <Logo size={28} />
                <span className="font-display font-bold">AriseHub</span>
              </span>
              <button onClick={() => setDrawerOpen(false)} className="text-ink-300">
                <Icon name="x" />
              </button>
            </div>
            {nav}
            <SidebarFooter name={displayName} role={profile?.role} profileId={profile?.id} onSignOut={signOut} />
          </aside>
        </div>
      )}

      {/* Main column */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex min-h-14 shrink-0 items-center gap-3 border-b border-ink-100 bg-white px-4 pt-safe safe-x">
          <button
            onClick={() => setDrawerOpen(true)}
            className="text-ink-600 lg:hidden"
            aria-label="Open menu"
          >
            <Icon name="menu" />
          </button>
          <div className="flex items-center gap-2 lg:hidden">
            <Logo size={24} />
            <span className="font-display text-sm font-bold">AriseHub</span>
          </div>
          <div className="flex-1" />
          <GlobalSearch />
          {!isIT && (
          <button
            onClick={() => setHelpOpen(true)}
            className="flex items-center gap-2 rounded-lg bg-brand-500 px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-brand-600"
          >
            <Icon name="help" size={18} />
            <span className="hidden sm:inline">Get IT Help</span>
          </button>
          )}
        </header>

        <main className="flex-1 overflow-y-auto">{children}</main>
      </div>

      {helpOpen && (
        <GetITHelp profile={profile} email={email} onClose={() => setHelpOpen(false)} />
      )}
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
    <div className="mt-4 border-t border-ink-700 px-3 pt-4">
      <div className="mb-2 px-2">
        <p className="truncate text-sm font-medium text-white">{name}</p>
        <p className="text-xs text-ink-400">{role?.replace("_", " ") ?? "Member"}</p>
      </div>
      <a
        href="/account/notifications"
        className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-ink-200 transition hover:bg-ink-700 hover:text-white"
      >
        <Icon name="help" />
        Notifications
      </a>
      <button
        onClick={onSignOut}
        className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-ink-200 transition hover:bg-ink-700 hover:text-white"
      >
        <Icon name="logout" />
        Sign out
      </button>
    </div>
  );
}
