import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { canResetPasswordFor } from "@/lib/authz";

export const runtime = "nodejs";

/**
 * Generate a one-time set-password link for another user.
 *
 * Allowed for Super_Admin or anyone in the IT Department — IT runs the help
 * desk, so they need to unlock people without knowing (or setting) passwords.
 * The link is returned to the caller to hand over; no password is ever created,
 * transmitted, or stored by us.
 */
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data: me } = await supabase
    .from("profiles")
    .select("id, role")
    .eq("user_id", user.id)
    .single();
  const meRow = me as { id: string; role: string } | null;
  if (!meRow) return NextResponse.json({ error: "no profile" }, { status: 403 });

  // Authorize: Super_Admin, or a member of the IT Department.
  let allowed = meRow.role === "Super_Admin";
  if (!allowed) {
    const { data: itDept } = await supabase
      .from("departments")
      .select("id")
      .eq("slug", "it")
      .maybeSingle();
    if (itDept) {
      const { data: m } = await supabase
        .from("department_members")
        .select("id")
        .eq("department_id", (itDept as { id: string }).id)
        .eq("profile_id", meRow.id)
        .maybeSingle();
      allowed = !!m;
    }
  }
  if (!allowed) {
    return NextResponse.json({ error: "IT department or Super_Admin only" }, { status: 403 });
  }

  const { email } = (await req.json()) as { email?: string };
  if (!email) return NextResponse.json({ error: "email required" }, { status: 400 });

  const admin = createAdminClient();

  // A help-desk unlock must not be a route to the top.
  //
  // Authorization above is "any row in department_members for the IT
  // department" — not a department role, not an app role. Anyone added to IT
  // could previously mint a recovery link for ANY account, including
  // Super_Admin, and the link comes straight back in the response with no email
  // sent, so the target never learns. That is a complete account takeover, and
  // it chains: the IT lead can add whoever they like to the department.
  //
  // Super_Admin keeps the unrestricted power. Everyone else is capped at
  // unprivileged accounts, which is the actual help-desk job.
  if (meRow.role !== "Super_Admin") {
    const { data: target } = await admin
      .from("profiles")
      .select("role")
      .ilike("email", email.trim())
      .maybeSingle();
    const targetRole = (target as { role?: string } | null)?.role ?? null;
    if (!canResetPasswordFor(meRow.role, targetRole)) {
      return NextResponse.json(
        { error: "Only a Super_Admin can reset a privileged account." },
        { status: 403 },
      );
    }
  }
  const { data, error } = await admin.auth.admin.generateLink({
    type: "recovery",
    email: email.toLowerCase(),
  });
  if (error || !data?.properties?.hashed_token) {
    return NextResponse.json(
      { error: error?.message ?? "Could not generate a reset link" },
      { status: 400 },
    );
  }

  const origin = new URL(req.url).origin;
  const link = `${origin}/auth/confirm?token_hash=${data.properties.hashed_token}&type=recovery`;

  return NextResponse.json({ link });
}
