import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import type { UserRole } from "@/lib/database.types";
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
import {
  LeaderPanel,
  CampusRollup,
  type CampusRollup as CampusRollupRow,
  type LeaderGroup,
  type LeaderAssignment,
} from "@/components/dashboard/LeaderPanel";
import { DashboardSwitch } from "@/components/dashboard/DashboardSwitch";
import { visibleModules } from "@/lib/modules";

// The dashboard used to end with a text strip linking every module. It
// duplicated navigation that already exists three other ways — the sidebar, the
// bottom bar and search — so it was removed. Modules are now findable by name
// in the search box, which is where "where is X?" belongs.

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
    .select("id, role")
    .eq("user_id", user!.id)
    .single();
  const me = profileRow as { id: string; role?: UserRole } | null;
  const myProfileId = me?.id ?? "";

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
      // A pending RESPONSE needs somebody to respond: unfilled positions are
      // also status "invited" but counting them here made the stat say 5 while
      // the card below listed 3 — and "everyone has replied" unreachable.
      if (a.status === "invited" && a.profile_id) pending++;
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


  // --- Leader's own slice (F13) and the all-campus rollup (F12) -------------
  // Both are additive: a member sees neither, so the dashboard they already
  // know is unchanged.
  const isSuper = me?.role === 'Super_Admin';
  const { data: myGroups } = await supabase
    .from('group_members')
    .select('group_id, is_leader, groups(id, name)')
    .eq('profile_id', myProfileId)
    .eq('is_leader', true);
  const leaderGroupRows = (myGroups ?? []) as unknown as {
    group_id: string;
    groups: { id: string; name: string } | null;
  }[];
  const leaderGroups: LeaderGroup[] = [];
  if (leaderGroupRows.length) {
    const ids = leaderGroupRows.map((g) => g.group_id);
    const [{ data: counts }, { data: meetings }] = await Promise.all([
      supabase.from('group_members').select('group_id').in('group_id', ids),
      supabase.from('group_meetings').select('group_id, meets_at').in('group_id', ids).order('meets_at', { ascending: false }),
    ]);
    const size: Record<string, number> = {};
    for (const c of (counts ?? []) as { group_id: string }[]) size[c.group_id] = (size[c.group_id] ?? 0) + 1;
    const last: Record<string, string> = {};
    for (const m of (meetings ?? []) as { group_id: string; meets_at: string }[]) {
      if (!last[m.group_id]) last[m.group_id] = m.meets_at;
    }
    for (const g of leaderGroupRows) {
      if (!g.groups) continue;
      leaderGroups.push({
        id: g.groups.id,
        name: g.groups.name,
        memberCount: size[g.group_id] ?? 0,
        lastMet: last[g.group_id] ?? null,
      });
    }
  }

  const { data: myAssigns } = await supabase
    .from('plan_assignments')
    .select('id, position, status, plan_id, service_plans(title, service_date)')
    .eq('profile_id', myProfileId)
    .neq('status', 'declined')
    .limit(20);
  const leaderAssignments: LeaderAssignment[] = ((myAssigns ?? []) as unknown as {
    id: string;
    position: string;
    status: 'invited' | 'accepted' | 'declined';
    plan_id: string;
    service_plans: { title: string; service_date: string } | null;
  }[])
    .filter((a) => a.service_plans && a.service_plans.service_date >= todayIso)
    .map((a) => ({
      id: a.id,
      plan_id: a.plan_id,
      plan_title: a.service_plans!.title,
      service_date: a.service_plans!.service_date,
      position: a.position,
      status: a.status,
    }));

  let rollup: CampusRollupRow[] = [];
  if (isSuper) {
    const [{ data: campuses }, { data: dir }, { data: todayCheckins }, { data: openCards }] =
      await Promise.all([
        supabase.from('campuses').select('id, name').order('name'),
        supabase.from('people_directory').select('id, campus_id').is('archived_at', null),
        supabase.from('checkins').select('id, campus_id').gte('checked_in_at', todayIso),
        supabase.from('pipeline_cards').select('id').is('closed_at', null),
      ]);
    const people = (dir ?? []) as { campus_id: string | null }[];
    const ins = (todayCheckins ?? []) as { campus_id: string | null }[];
    rollup = ((campuses ?? []) as { id: string; name: string }[]).map((c) => ({
      campus_id: c.id,
      campus: c.name,
      people: people.filter((p) => p.campus_id === c.id).length,
      checkedInToday: ins.filter((i) => i.campus_id === c.id).length,
      // Cards aren't campus-scoped yet, so this is church-wide on every row
      // rather than a number split three ways that doesn't add up.
      openFollowUps: (openCards ?? []).length,
    }));
  }

  // --- Stat strip content --------------------------------------------------
  const planHref = plan ? `/services/${plan.id}` : "/services";
  const shortDate = plan ? planDateLabel(plan.service_date, "short") : "";
  const cell = [
    "",
    "border-l border-ink-100",
    "border-t border-ink-100 lg:border-l lg:border-t-0",
    "border-l border-t border-ink-100 lg:border-t-0",
  ];

  const moduleTiles = visibleModules(me?.role);

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      <DashboardSwitch
        modules={moduleTiles}
        greeting={<SundayHeading />}
        advanced={<>

      <div className="mt-6">
        <StatStrip>
          <StatCell
            className={cell[0]}
            href={planHref}
            kicker="Volunteers confirmed"
            value={plan ? `${accepted} / ${total}` : "—"}
            status={
              !plan
                ? "nothing scheduled for you"
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
            status={!plan ? "nothing scheduled for you" : pending > 0 ? `for ${shortDate}` : "everyone has replied"}
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
            {/* Viewer-relative, matching PlansList: RLS scopes plans by
                department (0065), so "no service scheduled" would be a false
                church-wide claim to a member outside every department. */}
            <p className="font-display font-semibold text-ink-900">
              Nothing you&apos;re scheduled on yet
            </p>
            <p className="mt-1 text-sm text-ink-500">
              Plans and volunteer rosters live in Services.
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
        <LeaderPanel groups={leaderGroups} assignments={leaderAssignments} />
        <CampusRollup rows={rollup} />
      </div>
        </>}
      />
    </div>
  );
}
