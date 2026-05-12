import * as Network from "expo-network";
import {
  getResolvedApiBaseUrl,
  rewriteRequestUrlWithExpoHost,
} from "@/services/config";
import { useSessionStore } from "@/store/session-store";

/** Same role as Inspect360 `getAPI_URL()`. */
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

/** Verbose API logs in __DEV__ (includes Expo Go; Inspect360 gated logs off in storeClient). */
function shouldLogApiVerbose(): boolean {
  return __DEV__;
}

function isNetworkishFetchError(message: string): boolean {
  return (
    /failed to fetch|network request failed|err_connection|networkerror|no network connection/i.test(
      message,
    )
  );
}

/**
 * Mobile API uses Passport cookie sessions (Inspect360-style). `credentials: "include"` sends
 * `easyfuel.sid`. JWT Bearer is only added when a real access token is stored (not `cookie-session`).
 */
export async function apiRequest(
  method: string,
  path: string,
  data?: unknown,
  options?: HttpRequestOptions,
): Promise<Response> {
  const baseUrl = getResolvedApiBaseUrl();
  const fullUrl = path.startsWith("http") ? path : `${baseUrl}${path.startsWith("/") ? path : `/${path}`}`;
  const timeout = options?.timeout ?? 15_000;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  const headersBase: Record<string, string> = data
    ? {
        "Content-Type": "application/json",
        "Cache-Control": "no-cache, no-store, must-revalidate",
        Pragma: "no-cache",
        Accept: "application/json",
      }
    : {
        "Cache-Control": "no-cache, no-store, must-revalidate",
        Pragma: "no-cache",
        Accept: "application/json",
      };

  if (!options?.skipAuth) {
    const token = useSessionStore.getState().accessToken;
    if (token && token !== "cookie-session") {
      headersBase.Authorization = `Bearer ${token}`;
    }
  }

  const doFetch = (targetUrl: string) =>
    fetch(targetUrl, {
      method,
      signal: controller.signal,
      headers: headersBase,
      body: data !== undefined ? JSON.stringify(data) : undefined,
      credentials: "include",
    });

  try {
    const networkCheck = Network.getNetworkStateAsync().catch(() => ({ isConnected: true }));
    const networkState = (await Promise.race([
      networkCheck,
      new Promise((resolve) => setTimeout(() => resolve({ isConnected: true }), 500)),
    ])) as { isConnected?: boolean };

    if (networkState.isConnected === false) {
      clearTimeout(timeoutId);
      throw new Error("No network connection. Please check your internet connection.");
    }

    const res = await doFetch(fullUrl);
    clearTimeout(timeoutId);

    if (__DEV__ && method === "POST" && path.includes("/login")) {
      const cookie = res.headers.get("set-cookie");
      console.log(
        "[API] Login HTTP OK — optional Set-Cookie:",
        cookie ?? "(none; JWT-in-body is fine)",
        "| Content-Type:",
        res.headers.get("content-type") ?? "",
      );
    }

    return res;
  } catch (error: unknown) {
    clearTimeout(timeoutId);

    const err = error as { message?: string; name?: string; status?: number };
    if (err?.status === 401 || err?.status === 403) {
      throw error;
    }

    if (err?.name === "AbortError") {
      throw new Error("Server problem. Request timed out. Please try again.");
    }

    const msg = String(err?.message ?? error ?? "");

    if (shouldLogApiVerbose()) {
      console.error(`[API] Request failed for ${method} ${fullUrl}:`, msg);
    }

    if (isNetworkishFetchError(msg) || msg.includes("No network connection")) {
      const retryUrl = rewriteRequestUrlWithExpoHost(fullUrl);
      if (retryUrl) {
        try {
          if (shouldLogApiVerbose()) {
            console.warn("[API] Retrying with Expo host IP:", retryUrl);
          }
          const retryController = new AbortController();
          const retryTimer = setTimeout(() => retryController.abort(), timeout);
          try {
            const retryRes = await fetch(retryUrl, {
              method,
              signal: retryController.signal,
              headers: headersBase,
              body: data !== undefined ? JSON.stringify(data) : undefined,
              credentials: "include",
            });
            return retryRes;
          } finally {
            clearTimeout(retryTimer);
          }
        } catch (retryErr) {
          if (shouldLogApiVerbose()) {
            console.error("[API] Retry with Expo host IP failed:", retryErr);
          }
        }
      }

      const apiRoot = getResolvedApiBaseUrl();
      let looksLikeLan = /192\.|10\.|172\.|localhost|127\.0\.0\.1/i.test(apiRoot);
      try {
        const host = new URL(apiRoot.replace(/\/+$/, "") + "/").hostname;
        looksLikeLan = looksLikeLan || /^\d{1,3}(\.\d{1,3}){3}$/.test(host);
      } catch {
        /* ignore */
      }
      const lanHint =
        shouldLogApiVerbose() && looksLikeLan
          ? ` Cannot reach ${apiRoot}. Same Wi‑Fi as dev PC, server running, firewall open.`
          : "";

      const technical = msg ? ` Details: ${msg.slice(0, 200)}` : "";
      if (path.includes("/api/login") && shouldLogApiVerbose()) {
        console.error("[API] Login transport failure — URL:", fullUrl, "| message:", msg);
      }

      throw new Error(
        `Server problem. Cannot connect to server. Please check your internet connection and try again.${lanHint}${technical}`,
      );
    }

    if (/SSL|certificate|CERT/i.test(msg)) {
      throw new Error(
        "SSL certificate error. If this is production HTTPS, fix the server chain (full certificate bundle) or test with a development build that bundles your intermediate CA.",
      );
    }

    throw error;
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

  const ct = res.headers.get("content-type") || "";
  if (ct && !ct.includes("application/json") && !ct.includes("text/json")) {
    const preview = text.trim().slice(0, 160);
    throw new Error(
      `Expected JSON from the server but received ${ct.split(";")[0] || "unknown type"}. ` +
        (preview.startsWith("<")
          ? "You may be hitting a login page or CDN instead of the Easy Fuel API. Check EXPO_PUBLIC_API_BASE_URL."
          : `Response starts with: ${preview}`),
    );
  }

  try {
    return JSON.parse(text) as T;
  } catch {
    const preview = text.trim().slice(0, 200);
    throw new Error(
      `Could not read the server response as JSON (HTTP ${res.status}). ` +
        (preview.startsWith("<")
          ? "The URL may point at the website instead of the API."
          : `First characters: ${preview}`),
    );
  }
}
