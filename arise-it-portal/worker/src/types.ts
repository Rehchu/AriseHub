export interface Env {
  DB: D1Database;
  // Static SPA build; the Worker runs first and falls through to this.
  ASSETS: Fetcher;
  FILES: R2Bucket;
  JWT_SECRET: string;
  WIFI_ENCRYPTION_KEY: string;
  ALLOWED_ORIGINS: string;
  // Optional email (Resend). If RESEND_API_KEY is unset, invites are skipped
  // gracefully and the admin shares the temp password manually as before.
  RESEND_API_KEY?: string;
  FROM_EMAIL?: string;
  // Ticket mail goes out as AriseIT rather than the portal's default sender, so
  // a status change lands in the same conversation as the rest of someone's IT
  // history. Unset falls back to "AriseIT <ariseit@myfaithtech.com>".
  IT_FROM_EMAIL?: string;
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
