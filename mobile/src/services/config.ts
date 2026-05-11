import Constants from "expo-constants";
import { Platform } from "react-native";

const extra = Constants.expoConfig?.extra ?? {};
const PRODUCTION_FALLBACK = "https://portal.easyfuel.ai";

function readExtraApi(): string | undefined {
  const fromExtra =
    (extra as { apiUrl?: string; apiBaseUrl?: string }).apiUrl?.trim() ||
    (extra as { apiBaseUrl?: string }).apiBaseUrl?.trim();
  return fromExtra || undefined;
}

function readEnvApi(): string | undefined {
  const v =
    process.env.EXPO_PUBLIC_API_URL?.trim() || process.env.EXPO_PUBLIC_API_BASE_URL?.trim();
  return v || undefined;
}

function getExpoHostIp(): string | null {
  const hostUri =
    Constants.expoConfig?.hostUri ||
    (Constants as { debuggerHostUri?: string }).debuggerHostUri ||
    (Constants as { manifest?: { hostUri?: string } }).manifest?.hostUri ||
    (Constants as { manifest2?: { extra?: { expoClient?: { hostUri?: string } } } }).manifest2
      ?.extra?.expoClient?.hostUri ||
    (Constants as { expoGoConfig?: { debuggerHost?: string } }).expoGoConfig?.debuggerHost ||
    null;

  if (!hostUri) return null;

  const cleaned = String(hostUri)
    .replace(/^https?:\/\//, "")
    .split("/")[0]
    .split(":")[0];

  return cleaned || null;
}

function replaceLocalhostWithReachableHost(apiUrl: string): string {
  const isDev =
    Constants.executionEnvironment !== "standalone" &&
    Constants.executionEnvironment !== "storeClient";
  if (!isDev) return apiUrl;
  if (!/localhost|127\.0\.0\.1/i.test(apiUrl)) return apiUrl;

  const isAndroid = Platform.OS === "android";
  const isIOS = Platform.OS === "ios";

  let hostUri = Constants.expoConfig?.hostUri;
  if (!hostUri && (Constants as { debuggerHostUri?: string }).debuggerHostUri) {
    hostUri = (Constants as { debuggerHostUri?: string }).debuggerHostUri;
  }

  if (hostUri) {
    const ip = hostUri.split(":")[0];
    return apiUrl.replace(/localhost|127\.0\.0\.1/gi, ip);
  }

  if (isAndroid) {
    return apiUrl.replace(/localhost|127\.0\.0\.1/gi, "10.0.2.2");
  }

  if (isIOS) {
    const manifestUrl =
      (Constants as { manifest?: { hostUri?: string } }).manifest?.hostUri ||
      (Constants as { manifest2?: { extra?: { expoClient?: { hostUri?: string } } } }).manifest2
        ?.extra?.expoClient?.hostUri;
    if (manifestUrl) {
      const ip = manifestUrl
        .split(":")[0]
        .replace(/^https?:\/\//, "")
        .replace(/^\/\//, "");
      if (ip && !/^localhost|127\.0\.0\.1$/i.test(ip)) {
        return apiUrl.replace(/localhost|127\.0\.0\.1/gi, ip);
      }
    }
  }

  return apiUrl;
}

function normalizeTrailingSlash(url: string): string {
  return url.replace(/\/+$/, "");
}

/**
 * Resolve API origin (no trailing slash). Same priority pattern as Inspect360 mobile:
 * env → app.config extra → production URL for release builds.
 */
export function getResolvedApiBaseUrl(): string {
  let apiUrl = readEnvApi() || readExtraApi();

  if (!apiUrl) {
    if (Constants.executionEnvironment === "standalone" || Constants.executionEnvironment === "storeClient") {
      apiUrl = PRODUCTION_FALLBACK;
    } else {
      throw new Error(
        "Missing API base URL. Set EXPO_PUBLIC_API_URL or EXPO_PUBLIC_API_BASE_URL in mobile/.env (see .env.example).",
      );
    }
  }

  apiUrl = replaceLocalhostWithReachableHost(apiUrl);
  return normalizeTrailingSlash(apiUrl);
}

let _cached: string | null = null;
let _last = 0;
const CACHE_MS = 2000;

export function getCachedResolvedApiBaseUrl(): string {
  const now = Date.now();
  if (!_cached || now - _last > CACHE_MS) {
    _cached = getResolvedApiBaseUrl();
    _last = now;
  }
  return _cached;
}

/** If request was sent to a stale LAN IP, retry using the Expo dev host IP (Inspect360-style). */
export function rewriteApiBaseUrlWithExpoHost(currentBase: string): string | null {
  try {
    const parsed = new URL(currentBase.endsWith("/") ? currentBase : `${currentBase}/`);
    const expoHostIp = getExpoHostIp();
    if (!expoHostIp) return null;

    const isPrivateIpv4 = /^\d{1,3}(\.\d{1,3}){3}$/.test(parsed.hostname);
    if (!isPrivateIpv4 || parsed.hostname === expoHostIp) return null;

    parsed.hostname = expoHostIp;
    let out = parsed.toString();
    if (out.endsWith("/")) out = out.slice(0, -1);
    return out;
  } catch {
    return null;
  }
}

export const appConfig = {
  get apiBaseUrl() {
    return getCachedResolvedApiBaseUrl();
  },
};
