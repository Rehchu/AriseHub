import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyTurnstile } from "@/lib/turnstile";
import { sendEmail, emailLayout, buttonHtml } from "@/lib/email";

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
  const { data: preexisting } = await admin
    .from("profiles")
    .select("id, full_name")
    .ilike("email", cleanEmail)
    .is("user_id", null)
    .maybeSingle();
  const orphan = preexisting as { id: string; full_name: string } | null;

  // A match must NOT be merged on an unverified email. Merging inherits the
  // existing member's identity — including guardian↔child pickup links — so
  // anyone with an invite link could type a congregant's address and take it
  // over. Instead: create the account UNCONFIRMED, stash the intended merge in
  // metadata, and email a confirmation link. The merge fires only once they
  // click it (lib/pending-merge.ts); email_confirmed_at is the proof.
  if (orphan) {
    const { data: link, error: linkErr } = await admin.auth.admin.generateLink({
      type: "signup",
      email: cleanEmail,
      password,
      options: {
        data: {
          full_name: cleanName || orphan.full_name,
          pending_merge_profile_id: orphan.id,
          merge_role: l.role,
          merge_campus_id: l.campus_id,
          merge_department_ids: l.department_ids ?? [],
        },
      },
    });
    if (linkErr || !link?.properties?.hashed_token) {
      await releaseClaim();
      const already = /already|registered|exists/i.test(linkErr?.message ?? "");
      return NextResponse.json(
        {
          error: already
            ? "That email already has an account — try signing in instead."
            : (linkErr?.message ?? "Could not start your registration."),
        },
        { status: 400 },
      );
    }

    const origin = new URL(req.url).origin;
    const confirmUrl = `${origin}/auth/confirm?token_hash=${link.properties.hashed_token}&type=signup&next=/dashboard`;
    const mail = await sendEmail({
      to: cleanEmail,
      subject: "Confirm your AriseHub account",
      html: emailLayout(
        "One more step",
        `<p style="color:#34353b;font-size:15px;line-height:1.5">
           You're on file with the church already, so confirm this is your email
           and we'll connect your account to your existing record.
         </p>
         ${buttonHtml(confirmUrl, "Confirm my account")}
         <p style="color:#6d6e76;font-size:13px">
           If you didn't try to join AriseHub, you can ignore this email.
         </p>`,
      ),
    });

    // If we couldn't email them, the confirmation can never be delivered — and
    // we must NOT hand the link back to an anonymous caller (that would be the
    // hole we're closing). Remove the unconfirmed account, return the use, and
    // tell them to ask a leader.
    if (!mail.ok) {
      const newId = link.user?.id;
      if (newId) await admin.auth.admin.deleteUser(newId);
      await releaseClaim();
      return NextResponse.json(
        {
          error:
            "We couldn't send your confirmation email. Ask your leader to finish setting up your account.",
        },
        { status: 502 },
      );
    }

    // No signInWithPassword on the client for this branch — the account is
    // unconfirmed until they click the link.
    return NextResponse.json({ ok: true, pendingVerification: true });
  }

  // No pre-existing record: a fresh identity, nobody to impersonate — create it
  // confirmed and let them straight in. The link was the invitation.
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
