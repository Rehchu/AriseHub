import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { SundayHeading } from "@/components/dashboard/SundayHeading";
import { StatStrip, StatCell } from "@/components/dashboard/StatStrip";
import { CheckedInToday } from "@/components/dashboard/CheckedInToday";
import { ItTicketsStat } from "@/components/dashboard/ItTicketsStat";
import {
  PendingResponses,
  type PendingRow,
} from "@/components/dashboard/PendingResponses";
import {
  RecentMessages,
  type RecentMessageRow,
} from "@/components/dashboard/RecentMessages";

// Every module stays one click away, as a text strip rather than a wall of
// tiles duplicating the sidebar.
const MODULES: [string, string][] = [
  ["Messages", "/messages"],
  ["People", "/people"],
  ["Groups", "/groups"],
  ["Calendar", "/calendar"],
  ["Services", "/services"],
  ["Check-Ins", "/checkins"],
  ["Forms", "/forms"],
  ["Reports", "/reports"],
];

/** "2026-08-16" → "Sunday, Aug 16". Date-only, so UTC keeps it exact. */
function planDateLabel(iso: string, style: "long" | "short" = "long") {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", {
    ...(style === "long" ? { weekday: "long" as const } : {}),
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: profileRow } = await supabase
    .from("profiles")
    .select("id")
    .eq("user_id", user!.id)
    .single();
  const myProfileId = (profileRow as { id: string } | null)?.id ?? "";

  // --- The next service plan this user is allowed to see -------------------
  const todayIso = new Date().toISOString().slice(0, 10);
  const { data: planRow } = await supabase
    .from("service_plans")
    .select("id, title, service_date")
    .gte("service_date", todayIso)
    .order("service_date", { ascending: true })
    .limit(1)
    .maybeSingle();
  const plan = planRow as { id: string; title: string; service_date: string } | null;

  let accepted = 0;
  let total = 0;
  let pending = 0;
  let unfilled = 0;
  const pendingRows: PendingRow[] = [];

  if (plan) {
    const { data: assigns } = await supabase
      .from("plan_assignments")
      .select("id, position, status, profile_id, profiles(full_name)")
      .eq("plan_id", plan.id)
      .order("position");
    for (const a of (assigns ?? []) as unknown as {
      id: string;
      position: string;
      status: "invited" | "accepted" | "declined";
      profile_id: string | null;
      profiles: { full_name: string } | null;
    }[]) {
      total++;
      if (a.status === "accepted") accepted++;
      if (a.status === "invited") pending++;
      if (!a.profile_id) {
        unfilled++;
      } else if (a.status === "invited" && a.profiles) {
        pendingRows.push({
          assignmentId: a.id,
          profileId: a.profile_id,
          name: a.profiles.full_name,
          position: a.position,
        });
      }
    }
  }

  // --- My channels, newest conversation first ------------------------------
  // RLS hands back only channels the user belongs to (all of them for the
  // roles that may see all), so no membership filter is needed here.
  const { data: chans } = await supabase
    .from("channels")
    .select("id, type, title")
    .limit(100);
  const channels = (chans ?? []) as {
    id: string;
    type: "department" | "direct" | "support";
    title: string | null;
  }[];

  // Direct channels have no title — the label is the other participant.
  const directIds = channels.filter((c) => c.type === "direct").map((c) => c.id);
  const otherName: Record<string, string> = {};
  if (directIds.length) {
    const { data: members } = await supabase
      .from("channel_members")
      .select("channel_id, profile_id, profiles(full_name)")
      .in("channel_id", directIds);
    for (const m of (members ?? []) as unknown as {
      channel_id: string;
      profile_id: string;
      profiles: { full_name: string } | null;
    }[]) {
      if (m.profile_id !== myProfileId && m.profiles) {
        otherName[m.channel_id] = m.profiles.full_name;
      }
    }
  }

  const lastMessage: Record<string, { body: string; created_at: string }> = {};
  if (channels.length) {
    const { data: msgs } = await supabase
      .from("messages")
      .select("channel_id, body, created_at")
      .in(
        "channel_id",
        channels.map((c) => c.id),
      )
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      // Newest N across ALL channels, first-seen-per-channel wins. Deep enough
      // that one busy channel can't shadow the rest into "No messages yet" —
      // same heuristic (and depth) as ChannelList's unread scan.
      .limit(500);
    for (const m of (msgs ?? []) as {
      channel_id: string;
      body: string;
      created_at: string;
    }[]) {
      if (!lastMessage[m.channel_id]) {
        lastMessage[m.channel_id] = { body: m.body, created_at: m.created_at };
      }
    }
  }

  // sortKey orders the list here and is stripped before the rows reach the
  // presentational component.
  const messageRows: (RecentMessageRow & { sortKey: string })[] = channels
    .map((c) => {
      const last = lastMessage[c.id];
      return {
        channelId: c.id,
        label:
          c.type === "direct"
            ? (otherName[c.id] ?? "Direct message")
            : (c.title ?? "Department"),
        preview: last?.body ?? "No messages yet",
        dateLabel: last
          ? new Date(last.created_at).toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
              timeZone: "UTC",
            })
          : "",
        sortKey: last?.created_at ?? "",
      };
    })
    .sort((a, b) => (a.sortKey < b.sortKey ? 1 : -1))
    .slice(0, 6);

  // --- Stat strip content --------------------------------------------------
  const planHref = plan ? `/services/${plan.id}` : "/services";
  const shortDate = plan ? planDateLabel(plan.service_date, "short") : "";
  const cell = [
    "",
    "border-l border-ink-100",
    "border-t border-ink-100 lg:border-l lg:border-t-0",
    "border-l border-t border-ink-100 lg:border-t-0",
  ];

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      <SundayHeading />

      <div className="mt-6">
        <StatStrip>
          <StatCell
            className={cell[0]}
            href={planHref}
            kicker="Volunteers confirmed"
            value={plan ? `${accepted} / ${total}` : "—"}
            status={
              !plan
                ? "No plan scheduled"
                : unfilled > 0
                  ? `${unfilled} unfilled position${unfilled === 1 ? "" : "s"}`
                  : total === 0
                    ? "no positions yet"
                    : pending > 0
                      ? "replies still out"
                      : "roster complete"
            }
            attention={!!plan && unfilled > 0}
          />
          <StatCell
            className={cell[1]}
            href={planHref}
            kicker="Open responses"
            value={plan ? String(pending) : "—"}
            status={!plan ? "No plan scheduled" : pending > 0 ? `for ${shortDate}` : "everyone has replied"}
            attention={!!plan && pending > 0}
          />
          <CheckedInToday className={cell[2]} />
          <ItTicketsStat className={cell[3]} />
        </StatStrip>
      </div>

      <div className="mt-4 grid items-start gap-4 lg:grid-cols-[1.5fr_1fr]">
        {plan ? (
          <PendingResponses
            planDateLabel={planDateLabel(plan.service_date)}
            planHref={planHref}
            rows={pendingRows}
            unfilled={unfilled}
          />
        ) : (
          <section className="rounded-xl border border-ink-100 bg-white px-6 py-10 text-center">
            <p className="font-display font-semibold text-ink-900">
              No service scheduled yet
            </p>
            <p className="mt-1 text-sm text-ink-500">
              Plans and volunteer rosters are created in Services.
            </p>
            <Link
              href="/services"
              className="mt-4 inline-block rounded-lg bg-accent px-3 py-1.5 text-sm font-semibold text-onaccent transition hover:bg-accent-strong"
            >
              Go to Services
            </Link>
          </section>
        )}

        <RecentMessages rows={messageRows.map(({ sortKey: _, ...r }) => r)} />
      </div>

      <nav
        aria-label="All modules"
        className="mt-8 flex flex-wrap items-baseline gap-x-4 gap-y-2 border-t border-ink-100 pt-4"
      >
        <span className="text-[10px] font-semibold uppercase tracking-wide text-ink-400">
          Modules
        </span>
        {MODULES.map(([label, href]) => (
          <Link
            key={href}
            href={href}
            className="text-sm font-medium text-ink-700 hover:text-ink-900 hover:underline"
          >
            {label}
          </Link>
        ))}
      </nav>
    </div>
  );
}
