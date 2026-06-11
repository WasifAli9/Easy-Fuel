import type { UserRole } from "@/navigation/types";

/** Session user returned from `GET /api/auth/user` and login payload (Inspect360-style `User`). */
export type User = {
  id: string;
  email: string;
  role: UserRole | "admin" | "company" | null;
};
