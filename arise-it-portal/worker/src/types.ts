export interface Env {
  DB: D1Database;
  FILES: R2Bucket;
  JWT_SECRET: string;
  WIFI_ENCRYPTION_KEY: string;
  ALLOWED_ORIGINS: string;
  // Optional email (Resend). If RESEND_API_KEY is unset, invites are skipped
  // gracefully and the admin shares the temp password manually as before.
  RESEND_API_KEY?: string;
  FROM_EMAIL?: string;
  // AriseHub single sign-in: the Supabase project URL whose JWTs this API will
  // accept (mapped to local users by email). Unset = bridge disabled, the
  // portal's own cookie login is the only path.
  SUPABASE_URL?: string;
  // Shared with the AriseHub worker to sign single sign-on hand-off codes.
  SSO_SHARED_SECRET?: string;
}

export type Role = "super_admin" | "campus_admin" | "viewer";

export interface AuthUser {
  id: number;
  role: Role;
  campusId: number | null;
}

export type Variables = {
  user: AuthUser;
};
