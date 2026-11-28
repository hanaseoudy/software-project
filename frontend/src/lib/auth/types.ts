/** Public /auth/me response; credentials never enter client state (ACC-19). */
export interface CurrentUser {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  role: "user" | "admin" | "moderator";
  providerType: "airline" | "hotel" | null;
  providerId: string | null;
  mustChangePassword: boolean;
  emailVerified: boolean;
}

export type AccessRole = "user" | "admin" | "airline" | "hotel";
