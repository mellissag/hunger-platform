export type UserRole = "owner" | "admin" | "master" | "reception";

export type SessionUser = {
  id: string;
  email: string;
  role: UserRole;
  first_name: string;
  last_name: string | null;
  lang: string;
  master_id: string | null;
  effective_permissions?: Record<string, boolean> | null;
};
