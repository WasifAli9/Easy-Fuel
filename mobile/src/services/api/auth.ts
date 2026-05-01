import { apiClient } from "@/services/api/client";
import { saveSecureSession, clearSecureSession, readSecureSession } from "@/services/storage";
import { useSessionStore } from "@/store/session-store";
import { UserRole } from "@/navigation/types";

export async function hydrateSessionFromStorage() {
  const { role } = await readSecureSession();
  if (role) {
    useSessionStore
      .getState()
      .setSession({ accessToken: "cookie-session", refreshToken: "cookie-session", role: role as UserRole });
  }
  useSessionStore.getState().markHydrated();
}

export async function signInWithPassword(email: string, password: string) {
  const { data } = await apiClient.post<{
    user: { role: UserRole | "admin" | null };
  }>("/api/auth/login", { email, password });
  const role = data.user?.role as UserRole | "admin" | null;
  if (!role) throw new Error("Unable to resolve account role for this user.");
  if (role === "admin") throw new Error("Admin accounts are not supported in the mobile app.");

  const sessionPayload = {
    accessToken: "cookie-session",
    refreshToken: "cookie-session",
    role,
  };
  await saveSecureSession(sessionPayload);
  useSessionStore.getState().setSession(sessionPayload);
}

export async function signOut() {
  await apiClient.post("/api/auth/logout").catch(() => undefined);
  await clearSecureSession();
  useSessionStore.getState().clearSession();
}

export async function changePasswordWithCurrent(
  _email: string,
  currentPassword: string,
  newPassword: string,
) {
  await apiClient.post("/api/auth/change-password", { currentPassword, newPassword });
}
