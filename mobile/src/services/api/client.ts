import axios from "axios";
import * as Network from "expo-network";
import Constants from "expo-constants";
import { Platform } from "react-native";
import { getDefaultApiHeaders } from "@/services/api/native-http";
import {
  getResolvedApiBaseUrl,
  rewriteApiBaseUrlWithExpoHost,
} from "@/services/config";
import { clearSecureSession, readSecureSession, saveSecureSession } from "@/services/storage";
import { useSessionStore } from "@/store/session-store";
import type { UserRole } from "@/navigation/types";

export const apiClient = axios.create({
  baseURL: "",
  timeout: 15_000,
});

function isNetworkishError(error: unknown): boolean {
  const msg = String((error as { message?: string })?.message ?? error ?? "");
  const code = (error as { code?: string })?.code;
  return (
    code === "ERR_NETWORK" ||
    msg.includes("Network Error") ||
    msg.includes("Network request failed") ||
    msg.includes("Failed to fetch") ||
    msg.includes("ERR_CONNECTION_REFUSED")
  );
}

apiClient.interceptors.request.use(async (config) => {
  config.baseURL = getResolvedApiBaseUrl();
  if (Platform.OS !== "web") {
    const uaHeaders = getDefaultApiHeaders();
    config.headers.Accept = uaHeaders.Accept ?? "application/json";
    if (uaHeaders["User-Agent"]) {
      config.headers["User-Agent"] = uaHeaders["User-Agent"];
    }
  }

  const isDev =
    Constants.executionEnvironment !== "standalone" &&
    Constants.executionEnvironment !== "storeClient";
  if (isDev) {
    const networkCheck = Network.getNetworkStateAsync().catch(() => ({ isConnected: true }));
    const networkState = (await Promise.race([
      networkCheck,
      new Promise((resolve) => setTimeout(() => resolve({ isConnected: true }), 500)),
    ])) as { isConnected?: boolean };
    if (networkState.isConnected === false) {
      throw new Error("No network connection. Please check your internet connection.");
    }
  }

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
    const isDev =
      Constants.executionEnvironment !== "standalone" &&
      Constants.executionEnvironment !== "storeClient";

    if (
      isDev &&
      originalRequest &&
      !originalRequest._retryWithExpoHost &&
      isNetworkishError(error)
    ) {
      const altBase = rewriteApiBaseUrlWithExpoHost(String(originalRequest.baseURL || ""));
      if (altBase) {
        originalRequest._retryWithExpoHost = true;
        originalRequest.baseURL = altBase;
        return apiClient.request(originalRequest);
      }
    }

    if (error.response?.status !== 401 || originalRequest?._retry) {
      return Promise.reject(error);
    }

    if (String(originalRequest?.url ?? "").includes("/api/auth/refresh")) {
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
      const base = getResolvedApiBaseUrl();
      const refreshRes = await fetch(`${base}/api/auth/refresh`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({ refreshToken: session.refreshToken }),
      });
      const refreshText = await refreshRes.text();
      let refreshJson: { accessToken?: string; refreshToken?: string; role?: string };
      try {
        refreshJson = refreshText ? JSON.parse(refreshText) : {};
      } catch {
        throw new Error(refreshText.slice(0, 200) || "Session refresh failed.");
      }
      if (!refreshRes.ok || !refreshJson.accessToken || !refreshJson.refreshToken) {
        throw new Error(
          (refreshJson as { message?: string }).message ?? "Session refresh failed.",
        );
      }

      const role: UserRole =
        (refreshJson.role as UserRole | undefined) ??
        useSessionStore.getState().role ??
        (session.role as UserRole) ??
        "customer";

      const userId = useSessionStore.getState().userId ?? "";
      const email = useSessionStore.getState().email ?? "";

      await saveSecureSession({
        accessToken: refreshJson.accessToken,
        refreshToken: refreshJson.refreshToken,
        role,
        userId,
        email,
      });

      useSessionStore.getState().setSession({
        accessToken: refreshJson.accessToken,
        refreshToken: refreshJson.refreshToken,
        role,
        userId,
        email,
      });

      originalRequest.headers.Authorization = `Bearer ${refreshJson.accessToken}`;
      return apiClient(originalRequest);
    } catch (refreshError) {
      await clearSecureSession();
      useSessionStore.getState().clearSession();
      return Promise.reject(refreshError);
    }
  },
);
