import type { UserRole } from "@/lib/database.types";

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
 * for, from profiles_checkin_insert through families, guardians, allergy notes
 * and room staffing — was redirected away from the page. And an IT_Admin could
 * open it, see the roster, then have every insert refused by RLS.
 *
 * The database is the authority here: is_checkin_role() is what actually
 * decides whether the work succeeds, and 0001 states the intent plainly —
 * "Staff/Volunteer/Super_Admin can read the directory and run check-in". IT
 * runs IT; children's ministry is not their job.
 *
 * tests/rls asserts this array still matches the SQL function, so the two
 * cannot drift apart again.
 */
export const CHECKIN_ROLES: UserRole[] = ["Super_Admin", "Staff", "Volunteer"];

export function canRunCheckin(role: string | null | undefined): boolean {
  return !!role && (CHECKIN_ROLES as string[]).includes(role);
}
