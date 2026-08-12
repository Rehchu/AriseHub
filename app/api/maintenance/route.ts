import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// POST — report something broken.
//
// The row is the record; the chat post is how it actually reaches anyone. Most
// of these are reported by walking up to a maintenance volunteer on a Sunday,
// so a request sitting in a list nobody opens would be strictly worse than the
// conversation it replaced. It lands in the Maintenance department channel,
// where that team already talks, and pushes to their phones.
//
// The notification is best-effort: if the channel is missing or push fails, the
// request is still saved and still shows on the Maintenance page. Losing the
// report because the announcement failed would be the worse bug.
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, full_name, campus_id")
    .eq("user_id", user.id)
    .single();
  const me = profile as { id: string; full_name: string; campus_id: string | null } | null;
  if (!me) return NextResponse.json({ error: "no profile" }, { status: 403 });

  const body = (await req.json().catch(() => ({}))) as {
    title?: string;
    location?: string;
    details?: string;
    photoKey?: string;
    urgent?: boolean;
    reportedFor?: string;
  };
  const title = (body.title ?? "").trim();
  const location = (body.location ?? "").trim();
  if (!title || !location) {
    return NextResponse.json(
      { error: "Tell us what's wrong and where it is." },
      { status: 400 },
    );
  }

  const { data: row, error } = await supabase
    .from("maintenance_requests")
    .insert({
      title,
      location,
      details: (body.details ?? "").trim() || null,
      photo_key: body.photoKey ?? null,
      urgent: !!body.urgent,
      reported_by: me.id,
      reported_for: (body.reportedFor ?? "").trim() || null,
      campus_id: me.campus_id,
    })
    .select("id")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 502 });

  // --- Best-effort announcement -------------------------------------------
  // Admin client: the reporter is usually NOT in the maintenance department, so
  // under their own session they could neither post to that channel nor read
  // its membership.
  try {
    const admin = createAdminClient();
    const { data: dept } = await admin
      .from("departments")
      .select("id")
      .in("slug", ["maintenance-janitorial", "maintenance"])
      .maybeSingle();
    const deptId = (dept as { id: string } | null)?.id;
    if (deptId) {
      const { data: chan } = await admin
        .from("channels")
        .select("id")
        .eq("department_id", deptId)
        .maybeSingle();
      const channelId = (chan as { id: string } | null)?.id;

      const who = body.reportedFor?.trim()
        ? `${body.reportedFor.trim()} (via ${me.full_name})`
        : me.full_name;
      const text =
        `${body.urgent ? "🔧 URGENT — " : "🔧 "}${title}\n` +
        `Where: ${location}\n` +
        (body.details?.trim() ? `${body.details.trim()}\n` : "") +
        `Reported by ${who}`;

      if (channelId) {
        await admin.from("messages").insert({
          channel_id: channelId,
          profile_id: me.id,
          body: text,
        });
      }

      const { data: members } = await admin
        .from("department_members")
        .select("profile_id")
        .eq("department_id", deptId);
      const ids = ((members ?? []) as { profile_id: string }[]).map((m) => m.profile_id);
      await Promise.all(
        ids
          .filter((id) => id !== me.id)
          .map((id) =>
            fetch(new URL("/api/push/send", req.url).toString(), {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                cookie: req.headers.get("cookie") ?? "",
              },
              body: JSON.stringify({
                profileId: id,
                title: body.urgent ? "Urgent maintenance request" : "Maintenance request",
                body: `${title} — ${location}`,
                url: "/maintenance",
              }),
            }).catch(() => undefined),
          ),
      );
    }
  } catch {
    /* the request is saved; announcing it is a bonus, not a precondition */
  }

  return NextResponse.json({ ok: true, id: (row as { id: string }).id });
}
