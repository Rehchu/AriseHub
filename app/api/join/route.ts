import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

// Self-registration through a shared invite link.
//
// Supabase public signup is disabled, so registration goes through here: we
// validate the link's code server-side (service role — the anon key has no
// access to invite_links), then create the account with the role/campus/
// departments the link specifies. Someone who hasn't been given a link cannot
// register at all.
export async function POST(req: NextRequest) {
  const { code, email, password, fullName } = (await req.json()) as {
    code?: string;
    email?: string;
    password?: string;
    fullName?: string;
  };

  const cleanEmail = (email ?? "").trim().toLowerCase();
  const cleanName = (fullName ?? "").trim();
  if (!code || !cleanEmail || !password) {
    return NextResponse.json({ error: "Missing details." }, { status: 400 });
  }
  if (password.length < 8) {
    return NextResponse.json(
      { error: "Password must be at least 8 characters." },
      { status: 400 },
    );
  }

  const admin = createAdminClient();

  const { data: link } = await admin
    .from("invite_links")
    .select("id, role, campus_id, department_ids, active, expires_at, max_uses, uses")
    .eq("code", code)
    .maybeSingle();

  const l = link as {
    id: string;
    role: string;
    campus_id: string | null;
    department_ids: string[];
    active: boolean;
    expires_at: string | null;
    max_uses: number | null;
    uses: number;
  } | null;

  // Deliberately vague: don't help someone probe for valid codes.
  const invalid = NextResponse.json(
    { error: "This invite link is no longer valid. Ask your leader for a new one." },
    { status: 403 },
  );
  if (!l || !l.active) return invalid;
  if (l.expires_at && new Date(l.expires_at) < new Date()) return invalid;
  if (l.max_uses != null && l.uses >= l.max_uses) return invalid;

  // Create the account, already confirmed — the link was the invitation.
  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email: cleanEmail,
    password,
    email_confirm: true,
    user_metadata: { full_name: cleanName || cleanEmail.split("@")[0] },
  });

  if (createErr) {
    const already = /already|registered|exists/i.test(createErr.message);
    return NextResponse.json(
      {
        error: already
          ? "That email already has an account — try signing in instead."
          : createErr.message,
      },
      { status: 400 },
    );
  }

  // The signup trigger creates the profile; apply the link's role/campus/depts.
  const authUserId = created?.user?.id;
  let profileId: string | null = null;
  for (let i = 0; i < 6 && !profileId; i++) {
    const { data: p } = await admin
      .from("profiles")
      .select("id")
      .eq("user_id", authUserId)
      .maybeSingle();
    profileId = (p as { id: string } | null)?.id ?? null;
    if (!profileId) await new Promise((r) => setTimeout(r, 200));
  }

  if (profileId) {
    await admin
      .from("profiles")
      .update({
        role: l.role,
        campus_id: l.campus_id,
        ...(cleanName ? { full_name: cleanName } : {}),
      })
      .eq("id", profileId);

    if (l.department_ids?.length) {
      await admin.from("department_members").upsert(
        l.department_ids.map((department_id) => ({ department_id, profile_id: profileId })),
        { onConflict: "department_id,profile_id" },
      );
    }
  }

  await admin
    .from("invite_links")
    .update({ uses: l.uses + 1 })
    .eq("id", l.id);

  return NextResponse.json({ ok: true });
}
