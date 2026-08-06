import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Search, X } from "lucide-react";
import { api } from "../lib/api";
import type { Asset, Ticket } from "../lib/types";

export default function GlobalSearch() {
  const [query, setQuery] = useState("");
  const [assets, setAssets] = useState<Asset[]>([]);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    if (!query.trim()) {
      setAssets([]);
      setTickets([]);
      return;
    }
    const handle = setTimeout(async () => {
      const [assetRes, ticketRes] = await Promise.all([
        api.get<{ assets: Asset[] }>(`/api/assets?search=${encodeURIComponent(query)}`),
        api.get<{ tickets: Ticket[] }>(`/api/tickets?search=${encodeURIComponent(query)}`),
      ]);
      setAssets(assetRes.assets.slice(0, 5));
      setTickets(ticketRes.tickets.slice(0, 5));
    }, 300);
    return () => clearTimeout(handle);
  }, [query]);

  const hasResults = assets.length > 0 || tickets.length > 0;

  function go(path: string) {
    navigate(path);
    setQuery("");
    setOpen(false);
  }

  return (
    <div ref={containerRef} className="relative flex-1 max-w-md">
      <div className="relative">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          placeholder="Search assets, requests…"
          className="w-full border rounded-lg pl-9 pr-8 py-2 text-sm bg-white dark:bg-ink-900 dark:border-ink-600"
        />
        {query && (
          <button aria-label="Clear search" onClick={() => setQuery("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
            <X size={14} />
          </button>
        )}
      </div>
      {open && query.trim() && (
        <div className="absolute mt-1 w-full bg-white dark:bg-ink-800 rounded-lg shadow-lg border dark:border-ink-700 z-50 max-h-80 overflow-auto">
          {!hasResults && <div className="px-3 py-3 text-sm text-gray-400">No matches.</div>}
          {assets.length > 0 && (
            <div>
              <div className="px-3 pt-2 pb-1 text-[11px] uppercase text-gray-400 font-semibold">Assets</div>
              {assets.map((a) => (
                <button
                  key={a.id}
                  onClick={() => go(`/assets/${a.id}`)}
                  className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 dark:hover:bg-ink-700"
                >
                  <span className="font-medium">{a.assetTag}</span>{" "}
                  <span className="text-gray-400">
                    {a.model.brand} {a.model.modelName}
                  </span>
                </button>
              ))}
            </div>
          )}
          {tickets.length > 0 && (
            <div>
              <div className="px-3 pt-2 pb-1 text-[11px] uppercase text-gray-400 font-semibold">Requests</div>
              {tickets.map((t) => (
                <button
                  key={t.id}
                  onClick={() => go(`/requests/${t.id}`)}
                  className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 dark:hover:bg-ink-700"
                >
                  {t.subject}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
