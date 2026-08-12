import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { providerDiagnostics } from "@/lib/bible";

// GET /api/bible/diagnostics — why a Bible source isn't showing up.
//
// The reader deliberately hides provider failures so one bad source can't empty
// the list; this is where to see them. Super_Admin only: the errors can echo
// back request detail, and it reports which keys are configured.
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("user_id", user.id)
    .single();
  if ((profile as { role?: string } | null)?.role !== "Super_Admin") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  return NextResponse.json({ providers: await providerDiagnostics() });
}
