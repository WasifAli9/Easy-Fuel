import { Platform } from "react-native";
import { getDefaultApiHeaders } from "@/services/api/native-http";
import { getResolvedApiBaseUrl } from "@/services/config";

export type NativeLoginResult = {
  status: number;
  bodyText: string;
  setCookie: string | null;
};

/**
 * Single-path login POST (same strategy as Inspect360 `apiRequestJson` — one `fetch`, JSON body).
 * Kept for callers that need raw status/body; prefer `authService.login` from `@/services/authService`.
 */
export async function postLoginNative(
  baseUrl: string,
  email: string,
  password: string,
): Promise<NativeLoginResult> {
  if (Platform.OS === "web") {
    throw new Error("postLoginNative is for native only");
  }
  const base = baseUrl.trim().replace(/\/+$/, "") || getResolvedApiBaseUrl();
  const url = `${base}/api/login`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 45_000);
  try {
    const res = await fetch(url, {
      method: "POST",
      signal: controller.signal,
      headers: {
        ...getDefaultApiHeaders(),
        "Content-Type": "application/json",
        Accept: "application/json",
        "Cache-Control": "no-cache, no-store, must-revalidate",
        Pragma: "no-cache",
      },
      body: JSON.stringify({ email, password }),
    });
    const text = await res.text();
    return {
      status: res.status,
      bodyText: text,
      setCookie: res.headers.get("set-cookie"),
    };
  } finally {
    clearTimeout(timer);
  }
}
