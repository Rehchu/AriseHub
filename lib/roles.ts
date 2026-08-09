import type { UserRole } from "@/lib/database.types";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Who may run check-in.
 *
 * One list, because there were three and they disagreed:
 *
 *   page guard   Super_Admin, IT_Admin, Staff   (checkins + kiosk)
 *   RLS          Super_Admin, Staff, Volunteer  (public.is_checkin_role)
 *   nav menu     Super_Admin, IT_Admin, Staff   (lib/modules.ts)
 *
 * So a Volunteer — the role the whole check-in half of the schema is written
 * for — was redirected away from the page, while an IT_Admin could open it, see
 * the roster, then have every insert refused by RLS.
 *
 * The rule is no longer expressible as a role list at all (0064). It is:
 *
 *   Super_Admin, Admin or Staff anywhere,
 *   OR any member of a department with can_check_in.
 *
 * A Praise Team volunteer never checks anyone in; a Children's Department
 * member whose role is only Member does it every Sunday. Departments know that
 * and a role list cannot.
 */
export const ELEVATED_CHECKIN_ROLES: UserRole[] = ["Super_Admin", "Admin", "Staff"];

/**
 * The role half of the rule, for places that have a role and nothing else —
 * the nav menu deciding whether to show the Check-Ins item.
 *
 * Deliberately INCOMPLETE and deliberately generous: it cannot see departments,
 * so it answers "might this person run check-in?". Showing a nav item to
 * somebody the page then redirects is a small annoyance; hiding it from the
 * volunteer who needs it on a Sunday is not.
 */
export function mayRunCheckin(role: string | null | undefined): boolean {
  return !!role && ((ELEVATED_CHECKIN_ROLES as string[]).includes(role) || role === "Volunteer" || role === "Member");
}

/**
 * The real guard. Asks the database, so the page and the fifteen policies that
 * protect children's records can never disagree — which is exactly how the
 * three lists above drifted apart in the first place.
 *
 * Fails CLOSED: if the call errors we redirect rather than let someone through
 * to a page whose every write RLS would refuse anyway.
 */
export async function canRunCheckin(
  supabase: Pick<SupabaseClient, "rpc">,
): Promise<boolean> {
  const { data, error } = await supabase.rpc("is_checkin_role");
  if (error) return false;
  return data === true;
}
