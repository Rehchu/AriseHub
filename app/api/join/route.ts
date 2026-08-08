import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyTurnstile } from "@/lib/turnstile";

// Self-registration through a shared invite link.
//
// Supabase public signup is disabled, so registration goes through here: we
// validate the link's code server-side (service role — the anon key has no
// access to invite_links), then create the account with the role/campus/
// departments the link specifies. Someone who hasn't been given a link cannot
// register at all.
export async function POST(req: NextRequest) {
  const { code, email, password, fullName, turnstileToken } = (await req.json()) as {
    code?: string;
    email?: string;
    password?: string;
    fullName?: string;
    turnstileToken?: string;
  };

  // Bot check before we touch the database. Fails open when unconfigured.
  const bot = await verifyTurnstile(
    turnstileToken,
    req.headers.get("cf-connecting-ip"),
  );
  if (!bot.ok) {
    return NextResponse.json({ error: bot.error ?? "Verification failed." }, { status: 400 });
  }

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

  // Deliberately vague: don't help someone probe for valid codes.
  const invalid = NextResponse.json(
    { error: "This invite link is no longer valid. Ask your leader for a new one." },
    { status: 403 },
  );

  // Claim the use FIRST, in one statement (0056).
  //
  // This read the link, checked `uses >= max_uses` here in JS, created the
  // account, and only then wrote `uses + 1` back. Two people opening a
  // single-use link together both read uses=0, both passed, both got an
  // account. A link is a bearer secret carrying a role — "one use" has to mean
  // one, so the check and the increment happen in the same UPDATE and the
  // loser matches no row.
  const { data: claimedRows, error: claimErr } = await admin.rpc("claim_invite_link", {
    p_code: code,
  });
  const l = (claimedRows as
    | { id: string; role: string; campus_id: string | null; department_ids: string[] }[]
    | null)?.[0];
  if (claimErr || !l) return invalid;

  /** Hand the use back when signup fails after the claim. */
  const releaseClaim = async () => {
    await admin.rpc("release_invite_link", { p_id: l.id });
  };

  // Is this person already in the church's records without a login?
  //
  // Elvanto sync and family registration both create profiles with user_id
  // null. When such a person later signs up, the auth trigger makes a SECOND
  // profile — so their check-ins, family links, group memberships and serving
  // history stay on the old row while their login points at an empty new one.
  // Look them up first, then merge below.
  const { data: preexisting } = await admin
    .from("profiles")
    .select("id, full_name")
    .ilike("email", cleanEmail)
    .is("user_id", null)
    .maybeSingle();
  const orphan = preexisting as { id: string; full_name: string } | null;

  // Create the account, already confirmed — the link was the invitation.
  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email: cleanEmail,
    password,
    email_confirm: true,
    user_metadata: { full_name: cleanName || cleanEmail.split("@")[0] },
  });

  if (createErr) {
    // No account was created, so the use they claimed above is theirs to keep
    // trying with — most of these are "that email already exists" and a typo
    // must not burn a single-use link.
    await releaseClaim();
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

  // Merge onto the record they already had, rather than stranding it.
  //
  // Order matters: profiles.user_id is UNIQUE, so the trigger-created row has
  // to release the id before the existing row can take it. The new row is
  // seconds old and has nothing referencing it; the old one carries their
  // check-ins, family, groups and serving history.
  if (orphan && profileId && orphan.id !== profileId) {
    const { error: delErr } = await admin.from("profiles").delete().eq("id", profileId);
    if (!delErr) {
      const { error: linkErr } = await admin
        .from("profiles")
        .update({ user_id: authUserId })
        .eq("id", orphan.id);
      // If claiming the old row fails, the account exists with no profile at
      // all, which is worse than a duplicate — so put one back.
      if (linkErr) {
        const { data: recreated } = await admin
          .from("profiles")
          .insert({ user_id: authUserId, full_name: cleanName || orphan.full_name, email: cleanEmail })
          .select("id")
          .single();
        profileId = (recreated as { id: string } | null)?.id ?? null;
      } else {
        profileId = orphan.id;
      }
    }
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

  // The use was already recorded by claim_invite_link, before the account
  // existed. Nothing to increment here.
  return NextResponse.json({ ok: true });
}
