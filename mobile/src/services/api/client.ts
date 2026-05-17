import axios from "axios";
import * as Network from "expo-network";
import { Platform } from "react-native";
import { withCaseAliasesDeep } from "@/lib/case-normalize";
import {
  getResolvedApiBaseUrl,
  isExpoDevelopmentRuntime,
  rewriteApiBaseUrlWithExpoHost,
} from "@/services/config";
import { clearSecureSession, readSecureSession } from "@/services/storage";
import { useSessionStore } from "@/store/session-store";

/** Cookie sessions (Inspect360-style): send session cookie on every API request. */
export const apiClient = axios.create({
  baseURL: "",
  timeout: 15_000,
  withCredentials: true,
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
    config.headers.Accept = "application/json";
  }

  if (isExpoDevelopmentRuntime()) {
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
  if (token && token !== "cookie-session") {
    config.headers.Authorization = `Bearer ${token}`;
  } else {
    delete config.headers.Authorization;
  }

  const data = config.data;
  if (
    data &&
    typeof data === "object" &&
    !(data instanceof FormData) &&
    !(data instanceof URLSearchParams) &&
    !(data instanceof Blob) &&
    !(data instanceof ArrayBuffer)
  ) {
    config.data = withCaseAliasesDeep(data);
  }

  return config;
});

apiClient.interceptors.response.use(
  (response) => {
    if (response.data != null && typeof response.data === "object") {
      response.data = withCaseAliasesDeep(response.data);
    }
    return response;
  },
  async (error) => {
    const originalRequest = error.config;
    if (
      isExpoDevelopmentRuntime() &&
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

    if (error.response?.status === 401) {
      const session = await readSecureSession();
      if (session.accessToken === "cookie-session" || !session.accessToken) {
        await clearSecureSession();
        useSessionStore.getState().clearSession();
      }
    }

    return Promise.reject(error);
  },
);
