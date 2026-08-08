"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Icon } from "./Icon";
import { Modal } from "@/components/ui/Modal";

interface Hit {
  id: string;
  label: string;
  sub: string;
  href: string;
  kind: string;
  icon: string;
  accent: string;
}

/**
 * One search box across every module. RLS does the access control — a search
 * can only ever return rows the person could already open, so results can't
 * leak (e.g. private department chats or care items simply don't come back).
 */
export function GlobalSearch() {
  const supabase = createClient();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [busy, setBusy] = useState(false);
  const [cursor, setCursor] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  // Ctrl/Cmd-K opens it from anywhere.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 30);
    else {
      setQ("");
      setHits([]);
    }
  }, [open]);

  // Monotonic id per search. Clearing the debounce timer stops a query that
  // hasn't STARTED, but does nothing about six that are already in flight — so
  // a slow early result could land after a fast later one and overwrite it,
  // leaving the list showing matches for a prefix of what's in the box.
  const searchSeq = useRef(0);

  const search = useCallback(
    async (term: string) => {
      const seq = ++searchSeq.current;
      const like = `%${term}%`;
      setBusy(true);
      const [people, tasks, events, groupsRes, plans, forms] = await Promise.all([
        supabase.from("people_directory").select("id, full_name, email, role").ilike("full_name", like).is("archived_at", null).limit(6),
        supabase.from("tasks").select("id, title, status").ilike("title", like).limit(5),
        supabase.from("events").select("id, title, starts_at").ilike("title", like).limit(5),
        supabase.from("groups").select("id, name, group_type").ilike("name", like).limit(5),
        supabase.from("service_plans").select("id, title, service_date").ilike("title", like).limit(5),
        supabase.from("forms").select("id, title, slug").ilike("title", like).limit(4),
      ]);
      // A newer search started while these were running — discard.
      if (seq !== searchSeq.current) return;

      const out: Hit[] = [];
      for (const p of (people.data ?? []) as { id: string; full_name: string; email: string | null; role: string }[]) {
        out.push({ id: p.id, label: p.full_name, sub: p.email ?? p.role.replace("_", " "), href: "/people", kind: "Person", icon: "users", accent: "#7c3aed" });
      }
      for (const t of (tasks.data ?? []) as { id: string; title: string; status: string }[]) {
        out.push({ id: t.id, label: t.title, sub: t.status.replace("_", " "), href: "/tasks", kind: "Task", icon: "task", accent: "#0891b2" });
      }
      for (const e of (events.data ?? []) as { id: string; title: string; starts_at: string }[]) {
        out.push({ id: e.id, label: e.title, sub: new Date(e.starts_at).toLocaleDateString(), href: "/calendar", kind: "Event", icon: "calendar", accent: "#d97706" });
      }
      for (const g of (groupsRes.data ?? []) as { id: string; name: string; group_type: string }[]) {
        out.push({ id: g.id, label: g.name, sub: g.group_type.replace("_", " "), href: `/groups/${g.id}`, kind: "Group", icon: "group", accent: "#059669" });
      }
      for (const p of (plans.data ?? []) as { id: string; title: string; service_date: string }[]) {
        out.push({ id: p.id, label: p.title, sub: new Date(p.service_date + "T00:00:00").toLocaleDateString(), href: `/services/${p.id}`, kind: "Plan", icon: "music", accent: "#db2777" });
      }
      for (const f of (forms.data ?? []) as { id: string; title: string; slug: string }[]) {
        out.push({ id: f.id, label: f.title, sub: `/f/${f.slug}`, href: `/forms/${f.id}`, kind: "Form", icon: "form", accent: "#0d9488" });
      }
      setHits(out);
      setCursor(0);
      setBusy(false);
    },
    [supabase],
  );

  // Debounce so typing doesn't fire a query per keystroke.
  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) {
      setHits([]);
      return;
    }
    const t = setTimeout(() => search(term), 220);
    return () => clearTimeout(t);
  }, [q, search]);

  function go(h: Hit) {
    setOpen(false);
    router.push(h.href);
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex h-11 shrink-0 items-center justify-center gap-2 rounded-xl bg-ink-100 px-3 text-sm text-ink-500 transition hover:bg-ink-200 lg:h-9"
        aria-label="Search"
      >
        <Icon name="search" size={16} />
        <span className="hidden sm:inline">Search…</span>
        <kbd className="hidden rounded bg-white px-1 text-[10px] text-ink-400 md:inline">⌘K</kbd>
      </button>

      {open && (
        <Modal onClose={() => setOpen(false)} align="start" className="p-4 pt-20" label="Search">
          <div className="w-full max-w-lg overflow-hidden rounded-2xl bg-white shadow-2xl">
            <div className="flex items-center gap-2 border-b border-ink-100 px-4 py-3">
              <Icon name="search" size={18} className="text-ink-400" />
              <input
                ref={inputRef}
                className="flex-1 border-0 bg-transparent text-base outline-none placeholder:text-ink-300"
                placeholder="Search people, tasks, events, groups, plans…"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "ArrowDown") setCursor((c) => Math.min(c + 1, hits.length - 1));
                  if (e.key === "ArrowUp") setCursor((c) => Math.max(c - 1, 0));
                  if (e.key === "Enter" && hits[cursor]) go(hits[cursor]);
                }}
              />
              {busy && <span className="text-xs text-ink-400">…</span>}
            </div>

            <div className="max-h-80 overflow-y-auto p-2">
              {q.trim().length < 2 && (
                <p className="px-3 py-6 text-center text-sm text-ink-400">
                  Type at least two letters.
                </p>
              )}
              {q.trim().length >= 2 && hits.length === 0 && !busy && (
                <p className="px-3 py-6 text-center text-sm text-ink-400">No matches.</p>
              )}
              {hits.map((h, i) => (
                <button
                  key={`${h.kind}-${h.id}`}
                  onClick={() => go(h)}
                  onMouseEnter={() => setCursor(i)}
                  className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition ${
                    i === cursor ? "bg-ink-100" : "hover:bg-ink-50"
                  }`}
                >
                  <span
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-onaccent"
                    style={{ backgroundColor: h.accent }}
                  >
                    <Icon name={h.icon} size={16} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-ink-900">{h.label}</span>
                    <span className="block truncate text-xs text-ink-400">{h.sub}</span>
                  </span>
                  <span className="shrink-0 rounded bg-ink-100 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-ink-500">
                    {h.kind}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}
