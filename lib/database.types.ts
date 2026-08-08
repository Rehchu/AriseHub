// Focused hand-written types for the tables/RPCs the AriseHub UI touches.
// Regenerate the full set with `npm run types` once the Supabase CLI is linked
// (needs SUPABASE_ACCESS_TOKEN). Kept in sync with supabase/migrations/0001-0002.

export type UserRole =
  | "Super_Admin"
  /** Apostle and Pastor (0059). Same reach as Super_Admin across the app, and
   *  the only rung that sees every department chat. Which of the two someone is
   *  lives in profiles.title, which stays cosmetic. */
  | "Admin"
  | "IT_Admin"
  | "Staff"
  | "Volunteer"
  | "Member";

export interface Profile {
  id: string;
  user_id: string | null;
  full_name: string;
  email: string | null;
  phone: string | null;
  photo_url: string | null;
  role: UserRole;
  /** Ministry title (Apostle, Pastor, Elder…). Display only — never permissions. */
  title: string | null;
  bio: string | null;
  birthday: string | null;
  address: string | null;
  emergency_contact: string | null;
  emergency_phone: string | null;
  campus_id: string | null;
  is_checkin_lead: boolean;
  /**
   * Keeps service/QA accounts out of the member-facing directory. Grants and
   * restricts nothing — visibility only. Super_Admin is the only role that can
   * set it (enforced by the privileged-field trigger, migration 0036).
   */
  hidden_from_directory: boolean;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface Department {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  campus_id: string | null;
  /** Members may run child check-in regardless of role (0058). Not yet enforced
   *  — is_checkin_role() still decides; this is the flag the role work reads. */
  can_check_in?: boolean;
  created_at: string;
  updated_at: string;
}

export interface Channel {
  id: string;
  /** `support` is a private thread between one person and a department (0061). */
  type: "department" | "direct" | "support";
  department_id: string | null;
  title: string | null;
  created_at: string;
}

export interface ChannelMember {
  id: string;
  channel_id: string;
  profile_id: string;
  last_read_at: string | null;
  created_at: string;
}

export interface Message {
  id: string;
  channel_id: string;
  sender_profile_id: string;
  body: string | null;
  attachment_url?: string | null;
  attachment_type?: string | null;
  attachment_name?: string | null;
  created_at: string;
  edited_at: string | null;
  deleted_at: string | null;
}

export interface Campus {
  id: string;
  name: string;
  external_id: string | null;
  created_at: string;
  updated_at: string;
}

type Row<T> = { Row: T; Insert: Partial<T>; Update: Partial<T>; Relationships: [] };

export interface Database {
  public: {
    Tables: {
      profiles: Row<Profile>;
      departments: Row<Department>;
      channels: Row<Channel>;
      channel_members: Row<ChannelMember>;
      messages: Row<Message>;
      campuses: Row<Campus>;
    };
    Views: Record<string, never>;
    Functions: {
      get_or_create_dm: {
        Args: { other_profile: string };
        Returns: string;
      };
      /** Tablet lockdown (0053). The hash itself is never exposed. */
      kiosk_exit_pin_is_set: {
        Args: Record<string, never>;
        Returns: boolean;
      };
      kiosk_check_exit_pin: {
        Args: { pin: string };
        Returns: boolean;
      };
      kiosk_set_exit_pin: {
        Args: { pin: string | null };
        Returns: void;
      };
      /** Counted in the database so the 1000-row response cap can't skew it (0057). */
      report_people_breakdown: {
        Args: Record<string, never>;
        Returns: { role: UserRole; campus_id: string | null; n: number }[];
      };
      report_checkins_weekly: {
        Args: { p_since: string };
        Returns: { week: string; n: number }[];
      };
      report_new_people_weekly: {
        Args: { p_since: string };
        Returns: { week: string; n: number }[];
      };
      /** service_role only — checks and increments a link's uses atomically (0056). */
      claim_invite_link: {
        Args: { p_code: string };
        Returns: { id: string; role: UserRole; campus_id: string | null; department_ids: string[] }[];
      };
      release_invite_link: {
        Args: { p_id: string };
        Returns: void;
      };
      current_profile_id: {
        Args: Record<string, never>;
        Returns: string;
      };
    };
    Enums: {
      user_role: UserRole;
    };
    CompositeTypes: Record<string, never>;
  };
}
