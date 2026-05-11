import Constants from "expo-constants";
import * as Network from "expo-network";
import { getResolvedApiBaseUrl } from "@/services/config";
import { getDefaultApiHeaders } from "@/services/api/native-http";
import { useSessionStore } from "@/store/session-store";

/** Same role as Inspect360 `getAPI_URL()` — lazy base URL for all portal fetches. */
export function getAPI_URL(): string {
  return getResolvedApiBaseUrl();
}

export interface ApiError extends Error {
  status?: number;
}

export type HttpRequestOptions = {
  skipAuth?: boolean;
  timeout?: number;
};

export async function apiRequest(
  method: string,
  path: string,
  data?: unknown,
  options?: HttpRequestOptions,
): Promise<Response> {
  const base = getResolvedApiBaseUrl();
  const url = path.startsWith("http") ? path : `${base}${path.startsWith("/") ? path : `/${path}`}`;
  const timeout = options?.timeout ?? 15_000;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  const isDev =
    Constants.executionEnvironment !== "standalone" &&
    Constants.executionEnvironment !== "storeClient";

  try {
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

    const headers: Record<string, string> = {
      ...getDefaultApiHeaders(),
      Accept: "application/json",
      "Cache-Control": "no-cache, no-store, must-revalidate",
      Pragma: "no-cache",
    };
    if (data !== undefined) {
      headers["Content-Type"] = "application/json";
    }
    if (!options?.skipAuth) {
      const token = useSessionStore.getState().accessToken;
      if (token) {
        headers.Authorization = `Bearer ${token}`;
      }
    }

    return await fetch(url, {
      method,
      signal: controller.signal,
      headers,
      body: data !== undefined ? JSON.stringify(data) : undefined,
    });
  } finally {
    clearTimeout(timer);
  }
}

export async function apiRequestJson<T>(
  method: string,
  path: string,
  data?: unknown,
  options?: HttpRequestOptions,
): Promise<T> {
  const res = await apiRequest(method, path, data, options);
  const text = await res.text();

  if (!res.ok) {
    let message = res.statusText;
    try {
      if (text) {
        const parsed = JSON.parse(text) as { message?: string; error?: string };
        message = parsed.message ?? parsed.error ?? text;
      }
    } catch {
      if (text) message = text.slice(0, 500);
    }
    if (res.status === 401 || res.status === 403) {
      if (path.includes("/api/login")) {
        message = "Wrong credentials. Please try again.";
      }
    }
    const err = new Error(message) as ApiError;
    err.status = res.status;
    throw err;
  }

  if (res.status === 204 || !text) {
    return undefined as T;
  }

  return JSON.parse(text) as T;
}
