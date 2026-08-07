"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ModuleDef } from "@/lib/modules";
import { Icon } from "./Icon";

/**
 * Phone navigation. The things people open constantly live down here, within
 * thumb reach; everything else stays behind "More". Desktop keeps the sidebar.
 *
 * Targets are 56px tall — comfortably over the 44px minimum both Apple and
 * Google recommend, which the old 24px hamburger was not.
 */

// In priority order. Whichever of these the person can actually see fills the
// first four slots; "More" always takes the fifth.
export const BOTTOM_NAV_KEYS = ["dashboard", "messages", "services", "calendar", "tasks", "people"] as const;

export function bottomNavItems(modules: ModuleDef[]): ModuleDef[] {
  const byKey = new Map(modules.map((m) => [m.key, m]));
  return BOTTOM_NAV_KEYS.map((k) => byKey.get(k))
    .filter((m): m is ModuleDef => !!m && m.ready)
    .slice(0, 4);
}

export function BottomNav({
  items,
  onMore,
  moreActive,
}: {
  items: ModuleDef[];
  onMore: () => void;
  moreActive: boolean;
}) {
  const pathname = usePathname();

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-30 border-t border-ink-100 bg-white/95 pb-safe backdrop-blur lg:hidden"
      aria-label="Primary"
    >
      <div className="flex items-stretch">
        {items.map((m) => {
          const active = pathname === m.href || pathname.startsWith(m.href + "/");
          return (
            <Link
              key={m.key}
              href={m.href}
              aria-current={active ? "page" : undefined}
              className={`flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 px-1 py-2 text-[11px] font-medium transition ${
                active ? "text-brand-600" : "text-ink-500 active:bg-ink-50"
              }`}
            >
              <Icon name={m.icon} size={22} />
              <span className="truncate">{m.label}</span>
            </Link>
          );
        })}
        <button
          onClick={onMore}
          aria-label="More"
          aria-expanded={moreActive}
          className={`flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 px-1 py-2 text-[11px] font-medium transition ${
            moreActive ? "text-brand-600" : "text-ink-500 active:bg-ink-50"
          }`}
        >
          <Icon name="menu" size={22} />
          <span>More</span>
        </button>
      </div>
    </nav>
  );
}
