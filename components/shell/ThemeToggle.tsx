"use client";

import { useEffect, useState } from "react";
import { Icon } from "./Icon";

type Theme = "system" | "light" | "dark";

export const THEME_KEY = "arisehub-theme";

/**
 * System / Light / Dark. "System" is the default and simply removes the
 * override so the CSS media query decides.
 *
 * The choice is applied before first paint by the inline script in the root
 * layout; this control only has to keep the attribute and localStorage in
 * sync afterwards.
 */
export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>("system");

  useEffect(() => {
    const stored = window.localStorage.getItem(THEME_KEY) as Theme | null;
    if (stored === "light" || stored === "dark") setTheme(stored);
  }, []);

  function choose(next: Theme) {
    setTheme(next);
    const root = document.documentElement;
    if (next === "system") {
      root.removeAttribute("data-theme");
      window.localStorage.removeItem(THEME_KEY);
    } else {
      root.setAttribute("data-theme", next);
      window.localStorage.setItem(THEME_KEY, next);
    }
  }

  const options: { value: Theme; label: string; icon: "home" | "sun" | "moon" }[] = [
    { value: "system", label: "Auto", icon: "home" },
    { value: "light", label: "Light", icon: "sun" },
    { value: "dark", label: "Dark", icon: "moon" },
  ];

  return (
    <div className="px-3 py-2">
      <div
        role="radiogroup"
        aria-label="Colour theme"
        className="flex gap-1 rounded-lg bg-chrome-800 p-1"
      >
        {options.map((o) => {
          const active = theme === o.value;
          return (
            <button
              key={o.value}
              role="radio"
              aria-checked={active}
              onClick={() => choose(o.value)}
              title={o.label}
              className={`flex min-h-9 flex-1 items-center justify-center gap-1.5 rounded-md text-xs font-medium transition ${
                active
                  ? "bg-chrome-600 text-chrome-50"
                  : "text-chrome-300 hover:text-chrome-50"
              }`}
            >
              <Icon name={o.icon} size={15} />
              {o.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
