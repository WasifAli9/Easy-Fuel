import { apiClient } from "@/services/api/client";
import { saveSecureSession, clearSecureSession, readSecureSession } from "@/services/storage";
import { useSessionStore } from "@/store/session-store";
import { UserRole } from "@/navigation/types";
import { supabase } from "@/services/supabase";

async function fetchUserRole(userId: string): Promise<UserRole> {
  const { data, error } = await supabase.from("profiles").select("role").eq("id", userId).single();
  if (error || !data?.role) {
    throw new Error("Unable to resolve account role for this user.");
  }
  if (data.role === "admin") {
    throw new Error("Admin accounts are not supported in the mobile app.");
  }
  return data.role as UserRole;
}

export async function hydrateSessionFromStorage() {
  const { accessToken, refreshToken, role } = await readSecureSession();
  if (accessToken && refreshToken && role) {
    useSessionStore
      .getState()
      .setSession({ accessToken, refreshToken, role: role as UserRole });
  }
  useSessionStore.getState().markHydrated();
}

export async function signInWithPassword(email: string, password: string) {
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });
  if (error || !data.session || !data.user) {
    throw error ?? new Error("Invalid email or password.");
  }

  const role = await fetchUserRole(data.user.id);

  const sessionPayload = {
    accessToken: data.session.access_token,
    refreshToken: data.session.refresh_token,
    role,
  };
  await saveSecureSession(sessionPayload);
  useSessionStore.getState().setSession(sessionPayload);
}

export async function signOut() {
  await supabase.auth.signOut();
  await clearSecureSession();
  useSessionStore.getState().clearSession();
}

export async function changePasswordWithCurrent(
  email: string,
  currentPassword: string,
  newPassword: string,
) {
  const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
    email,
    password: currentPassword,
  });
  if (signInError || !signInData.session) {
    throw signInError ?? new Error("Current password is incorrect.");
  }

  const role = useSessionStore.getState().role ?? (await fetchUserRole(signInData.user.id));
  const sessionPayload = {
    accessToken: signInData.session.access_token,
    refreshToken: signInData.session.refresh_token,
    role,
  };
  await saveSecureSession(sessionPayload);
  useSessionStore.getState().setSession(sessionPayload);

  const { error: updateError } = await supabase.auth.updateUser({ password: newPassword });
  if (updateError) {
    throw updateError;
  }
}
