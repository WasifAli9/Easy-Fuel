import type { User } from "@/types";
import { apiRequestJson } from "@/services/httpApi";

export interface LoginCredentials {
  email: string;
  password: string;
}

export type JwtLoginResult = {
  accessToken: string;
  refreshToken: string;
  user: { id: string; email: string; role: User["role"] };
};

/**
 * Inspect360-shaped auth service: JSON login + cookie-less logout + current user.
 * Easy Fuel uses JWT in headers (applied in `httpApi`) instead of session cookies.
 */
export const authService = {
  async login(credentials: LoginCredentials): Promise<JwtLoginResult> {
    if (__DEV__) {
      console.log("[authService] POST /api/login");
    }
    const result = await apiRequestJson<JwtLoginResult>("POST", "/api/login", credentials, {
      skipAuth: true,
      timeout: 45_000,
    });
    if (!result?.accessToken || !result?.refreshToken || !result?.user?.id) {
      throw new Error("Login failed. Invalid response from server.");
    }
    return result;
  },

  async logout(): Promise<void> {
    try {
      await apiRequestJson<{ message?: string }>("POST", "/api/logout", undefined, { skipAuth: true });
    } catch {
      // Same as Inspect360 AuthContext: still clear local session if network fails.
    }
  },

  async getCurrentUser(): Promise<User> {
    return apiRequestJson<User>("GET", "/api/auth/user");
  },

  async changePasswordWithCurrent(currentPassword: string, newPassword: string): Promise<void> {
    await apiRequestJson("POST", "/api/auth/change-password", { currentPassword, newPassword });
  },
};
