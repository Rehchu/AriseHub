// Focused hand-written types for the tables/RPCs the AriseHub UI touches.
// Regenerate the full set with `npm run types` once the Supabase CLI is linked
// (needs SUPABASE_ACCESS_TOKEN). Kept in sync with supabase/migrations/0001-0002.

export type UserRole =
  | "Super_Admin"
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
  campus_id: string | null;
  is_checkin_lead: boolean;
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
  created_at: string;
  updated_at: string;
}

export interface Channel {
  id: string;
  type: "department" | "direct";
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
