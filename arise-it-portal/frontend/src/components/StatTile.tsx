import type { ReactNode } from "react";

export type StatTileColor = "brand" | "gold" | "slate" | "ink" | "green" | "muted";

const colorClasses: Record<StatTileColor, string> = {
  brand: "bg-brand-500 text-white",
  gold: "bg-gold-500 text-white",
  slate: "bg-slate-600 text-white",
  ink: "bg-ink-800 text-white",
  green: "bg-emerald-600 text-white",
  muted: "bg-gray-200 text-gray-600",
};

interface StatTileProps {
  label: string;
  value: number | string;
  color?: StatTileColor;
  icon?: ReactNode;
  onClick?: () => void;
}

export default function StatTile({ label, value, color = "slate", icon, onClick }: StatTileProps) {
  const Component = onClick ? "button" : "div";
  return (
    <Component
      onClick={onClick}
      className={`rounded-xl shadow-sm p-4 flex flex-col gap-2 text-left ${colorClasses[color]} ${
        onClick ? "cursor-pointer hover:opacity-90 transition-opacity" : ""
      }`}
    >
      <div className="flex items-center justify-between">
        <span className="text-3xl font-display font-bold">{value}</span>
        {icon && <span className="opacity-80">{icon}</span>}
      </div>
      <span className="text-xs uppercase tracking-wide opacity-90">{label}</span>
    </Component>
  );
}
