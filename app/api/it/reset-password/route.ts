import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail, emailLayout, buttonHtml } from "@/lib/email";

// Password reset performed BY IT on behalf of a member.
//
// People forget passwords and go to IT, so IT_Admin (and Super_Admin) can send
// a reset. We never see or set the password — Supabase issues a one-time link
// and the person chooses their own.
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data: me } = await supabase
    .from("profiles")
    .select("role")
    .eq("user_id", user.id)
    .single();
  const role = (me as { role?: string } | null)?.role;
  if (role !== "IT_Admin" && role !== "Super_Admin") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const { email } = (await req.json()) as { email?: string };
  const target = (email ?? "").trim().toLowerCase();
  if (!target) return NextResponse.json({ error: "email required" }, { status: 400 });

  const admin = createAdminClient();
  const origin = new URL(req.url).origin;

  // A help-desk unlock must not be a route to the top. Without this an IT_Admin
  // could mint a recovery link for a Super_Admin/Admin/IT_Admin account — and
  // when Resend isn't configured the link comes straight back in the response
  // (see below), so the target never even gets an email. That is a full account
  // takeover. Only a Super_Admin may reset a privileged account; this mirrors
  // the guard in admin/reset-password, which a sibling route already carries.
  if (role !== "Super_Admin") {
    const { data: t } = await admin
      .from("profiles")
      .select("role")
      .ilike("email", target)
      .maybeSingle();
    const targetRole = (t as { role?: string } | null)?.role;
    if (targetRole === "Super_Admin" || targetRole === "Admin" || targetRole === "IT_Admin") {
      return NextResponse.json(
        { error: "Only a Super_Admin can reset a privileged account." },
        { status: 403 },
      );
    }
  }

  const { data: linkData, error } = await admin.auth.admin.generateLink({
    type: "recovery",
    email: target,
  });
  if (error) {
    return NextResponse.json(
      { error: "Could not create a reset link", detail: error.message },
      { status: 400 },
    );
  }

  const tokenHash = (linkData?.properties as { hashed_token?: string } | undefined)?.hashed_token;
  const resetUrl = `${origin}/auth/confirm?token_hash=${tokenHash}&type=recovery`;

  const mail = await sendEmail({
    to: target,
    subject: "Reset your AriseHub password",
    html: emailLayout(
      "Reset your password",
      `<p style="color:#34353b;font-size:15px;line-height:1.5">
         Arise IT started a password reset for your AriseHub account. Choose a new
         password using the button below — the link works once.
       </p>
       ${buttonHtml(resetUrl, "Set a new password")}
       <p style="color:#6d6e76;font-size:13px">
         If you didn't ask for this, you can ignore this email — your current
         password still works.
       </p>`,
    ),
  });

  // If email isn't configured, hand the link back so IT can pass it on directly.
  return NextResponse.json({
    ok: true,
    emailed: mail.ok,
    resetUrl: mail.ok ? undefined : resetUrl,
    emailError: mail.ok ? undefined : mail.error,
  });
}
