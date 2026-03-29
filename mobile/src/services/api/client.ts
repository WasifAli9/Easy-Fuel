import axios from "axios";
import { appConfig } from "@/services/config";
import { clearSecureSession, readSecureSession, saveSecureSession } from "@/services/storage";
import { useSessionStore } from "@/store/session-store";
import { supabase } from "@/services/supabase";

export const apiClient = axios.create({
  baseURL: appConfig.apiBaseUrl,
  timeout: 15_000,
});

apiClient.interceptors.request.use(async (config) => {
  const token = useSessionStore.getState().accessToken;
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;
    if (error.response?.status !== 401 || originalRequest?._retry) {
      return Promise.reject(error);
    }

    originalRequest._retry = true;
    const session = await readSecureSession();
    if (!session.refreshToken) {
      await clearSecureSession();
      useSessionStore.getState().clearSession();
      return Promise.reject(error);
    }

    try {
      const { data, error } = await supabase.auth.refreshSession({
        refresh_token: session.refreshToken,
      });
      if (error || !data.session) {
        throw error ?? new Error("Session refresh failed.");
      }

      const role = useSessionStore.getState().role ?? session.role ?? "customer";
      await saveSecureSession({
        accessToken: data.session.access_token,
        refreshToken: data.session.refresh_token,
        role,
      });

      useSessionStore.getState().setSession({
        accessToken: data.session.access_token,
        refreshToken: data.session.refresh_token,
        role: role as "customer" | "driver" | "supplier" | "company",
      });

      originalRequest.headers.Authorization = `Bearer ${data.session.access_token}`;
      return apiClient(originalRequest);
    } catch (refreshError) {
      await clearSecureSession();
      useSessionStore.getState().clearSession();
      return Promise.reject(refreshError);
    }
  },
);
