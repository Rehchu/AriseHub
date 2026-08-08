import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Icon } from "@/components/shell/Icon";
import { MyTickets } from "@/components/it/MyTickets";

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, role")
    .eq("user_id", user!.id)
    .single();

  // Departments the signed-in person belongs to → their group chats.
  const { data: myChannels } = await supabase
    .from("channels")
    .select("id, title, type")
    .eq("type", "department")
    .order("title");

  const firstName = (profile?.full_name || "there").split(" ")[0];

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      <h1 className="font-display text-2xl font-bold text-ink-900">
        Welcome back, {firstName}
      </h1>
      <p className="mt-1 text-ink-500">
        Here&apos;s your Arise Church hub — people, ministry, and IT in one place.
      </p>

      {/* Renders nothing unless you actually have open tickets, so the
          dashboard does not grow a permanent empty box. */}
      <div className="mt-6">
        <MyTickets />
      </div>

      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Card
          href="/messages"
          accent="#2563eb"
          icon="chat"
          title="Messages"
          body={
            myChannels && myChannels.length > 0
              ? `${myChannels.length} department chat${myChannels.length > 1 ? "s" : ""} + direct messages`
              : "Department group chats & direct messages"
          }
        />
        <Card
          href="/people"
          accent="#7c3aed"
          icon="users"
          title="People"
          body="Church-wide directory"
        />
        <Card
          href="/groups"
          accent="#059669"
          icon="group"
          title="Groups"
          body="Small groups & attendance"
        />
        <Card
          href="/calendar"
          accent="#d97706"
          icon="calendar"
          title="Calendar"
          body="Events, camps & facility booking"
        />
        <Card
          href="/it"
          accent="#4b5563"
          icon="wrench"
          title="IT Support"
          body="Submit a request or track tickets"
        />
        <Card
          href="/services"
          accent="#db2777"
          icon="music"
          title="Services"
          body="Plans & volunteer scheduling"
        />
      </div>
    </div>
  );
}

function Card({
  href,
  accent,
  icon,
  title,
  body,
  soon,
}: {
  href: string;
  accent: string;
  icon: string;
  title: string;
  body: string;
  soon?: boolean;
}) {
  const inner = (
    <div className="flex h-full flex-col rounded-xl border border-ink-100 bg-white p-5 shadow-sm transition hover:shadow-md">
      <span
        className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg text-onaccent"
        style={{ backgroundColor: accent }}
      >
        <Icon name={icon} />
      </span>
      <div className="flex items-center gap-2">
        <h3 className="font-display font-semibold text-ink-900">{title}</h3>
        {soon && (
          <span className="rounded bg-ink-100 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-ink-400">
            Soon
          </span>
        )}
      </div>
      <p className="mt-1 text-sm text-ink-500">{body}</p>
    </div>
  );
  return soon ? (
    <div className="cursor-default opacity-70">{inner}</div>
  ) : (
    <Link href={href}>{inner}</Link>
  );
}

