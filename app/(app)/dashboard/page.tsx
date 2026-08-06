import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Icon } from "@/components/shell/Icon";

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
        <HelpCard />
        <Card
          href="/dashboard"
          accent="#7c3aed"
          icon="users"
          title="People"
          body="Directory & households"
          soon
        />
        <Card
          href="/dashboard"
          accent="#059669"
          icon="group"
          title="Groups"
          body="Small groups & attendance"
          soon
        />
        <Card
          href="/dashboard"
          accent="#d97706"
          icon="calendar"
          title="Calendar"
          body="Events & facility booking"
          soon
        />
        <Card
          href="/dashboard"
          accent="#db2777"
          icon="music"
          title="Services"
          body="Plans & volunteer scheduling"
          soon
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
        className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg text-white"
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

function HelpCard() {
  return (
    <div className="flex h-full flex-col rounded-xl border border-brand-100 bg-brand-50 p-5 shadow-sm">
      <span className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-brand-500 text-white">
        <Icon name="help" />
      </span>
      <h3 className="font-display font-semibold text-ink-900">Need IT help?</h3>
      <p className="mt-1 text-sm text-ink-600">
        Use the <span className="font-medium">Get IT Help</span> button in the top
        bar — your name and campus are filled in for you.
      </p>
    </div>
  );
}
