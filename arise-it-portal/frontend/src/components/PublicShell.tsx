import { ReactNode } from "react";
import { LogoMark } from "./Logo";

// Minimal branded wrapper for no-account pages (public request form, guest
// boards). No sidebar, no auth — just the Arise header and a centered card area.
export default function PublicShell({ children, wide = false }: { children: ReactNode; wide?: boolean }) {
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-ink-950">
      <header className="bg-ink-900 text-white px-5 py-4 flex items-center gap-2">
        <LogoMark size={32} />
        <div className="font-display font-bold tracking-wide text-sm leading-tight">
          ARISE IT
          <div className="text-[10px] font-sans font-normal text-ink-300 tracking-wider">PORTAL</div>
        </div>
      </header>
      <main className={`mx-auto p-4 sm:p-6 ${wide ? "max-w-4xl" : "max-w-lg"}`}>{children}</main>
      <footer className="text-center text-xs text-gray-400 py-6">Arise Church IT · Pineville, LA</footer>
    </div>
  );
}
