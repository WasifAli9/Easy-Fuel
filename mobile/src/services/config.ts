import Constants from "expo-constants";

const extra = Constants.expoConfig?.extra ?? {};

function resolveExpoHost(): string | null {
  const hostUri =
    (Constants.expoConfig as { hostUri?: string } | null)?.hostUri ??
    (Constants as { expoGoConfig?: { debuggerHost?: string } }).expoGoConfig?.debuggerHost ??
    null;

  if (!hostUri) {
    return null;
  }

  const [host] = hostUri.split(":");
  return host || null;
}

function normalizeApiBaseUrl(rawBaseUrl: string): string {
  const expoHost = resolveExpoHost();
  if (!expoHost) {
    return rawBaseUrl;
  }

  // In Expo Go on a real device, localhost points to the device itself.
  if (/localhost|127\.0\.0\.1/i.test(rawBaseUrl)) {
    return rawBaseUrl.replace(/localhost|127\.0\.0\.1/i, expoHost);
  }

  return rawBaseUrl;
}

export const appConfig = {
  apiBaseUrl: normalizeApiBaseUrl(
    process.env.EXPO_PUBLIC_API_BASE_URL ??
      (extra.apiBaseUrl as string | undefined) ??
      "",
  ),
};

if (!appConfig.apiBaseUrl) {
  throw new Error(
    "Missing API base URL. Set EXPO_PUBLIC_API_BASE_URL in mobile/.env.",
  );
}
