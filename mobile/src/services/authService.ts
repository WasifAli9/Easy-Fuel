import type { User } from "@/types";
import { apiRequestJson } from "@/services/httpApi";

export interface LoginCredentials {
  email: string;
  password: string;
}

/**
 * Inspect360-style: POST `/api/login` returns the portal user JSON; session cookie is set by the server.
 */
export const authService = {
  async login(credentials: LoginCredentials): Promise<{ user: User }> {
    if (__DEV__) {
      console.log("[authService] POST /api/login");
    }
    const user = await apiRequestJson<User>("POST", "/api/login", credentials, {
      skipAuth: true,
      timeout: 45_000,
    });
    if (!user?.id) {
      throw new Error("Login response missing user. Confirm EXPO_PUBLIC_API_BASE_URL matches the portal.");
    }
    return { user };
  },

  async logout(): Promise<void> {
    try {
      await apiRequestJson<{ message?: string }>("POST", "/api/logout", undefined, { skipAuth: true });
    } catch {
      // Inspect360-style: still clear local session if network fails.
    }
  },

  async getCurrentUser(): Promise<User> {
    return apiRequestJson<User>("GET", "/api/auth/user");
  },

  async changePasswordWithCurrent(currentPassword: string, newPassword: string): Promise<void> {
    await apiRequestJson("POST", "/api/auth/change-password", { currentPassword, newPassword });
  },
};
