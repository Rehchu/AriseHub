"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * The admin tab bar, in the same idiom as the service-plan tabs: the active
 * tab reads brand with a 2px accent underline sitting on the hairline.
 *
 * Nine tabs in a plain flex row squashed to illegible slivers on a phone —
 * which is why Rooms looked like it did not exist. Scroll sideways instead of
 * shrinking, and let the row bleed to the screen edge so it is obviously
 * scrollable.
 */
export function AdminTabs({
  tabs,
}: {
  tabs: { href: string; label: string }[];
}) {
  const pathname = usePathname();
  return (
    <div className="-mx-4 mt-6 border-b border-ink-100 sm:mx-0">
      <nav
        aria-label="Admin sections"
        className="-mb-px flex gap-5 overflow-x-auto px-4 sm:px-0"
      >
        {tabs.map((t) => {
          const active = pathname === t.href || pathname.startsWith(`${t.href}/`);
          return (
            <Link
              key={t.href}
              href={t.href}
              aria-current={active ? "page" : undefined}
              className={
                "shrink-0 whitespace-nowrap border-b-2 pb-2 pt-1 text-sm transition " +
                (active
                  ? "border-accent font-semibold text-brand-700"
                  : "border-transparent font-medium text-ink-500 hover:text-ink-700")
              }
            >
              {t.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
