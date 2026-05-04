import * as SecureStore from "expo-secure-store";

const ACCESS_TOKEN_KEY = "easy_fuel_access_token";
const REFRESH_TOKEN_KEY = "easy_fuel_refresh_token";
const USER_ROLE_KEY = "easy_fuel_user_role";
const THEME_MODE_KEY = "easy_fuel_theme_mode";
/** Raw `Cookie` header value for `easyfuel.sid` (React Native does not persist Set-Cookie like browsers). */
const SESSION_COOKIE_KEY = "easy_fuel_session_cookie";

export async function saveSecureSession(data: {
  accessToken: string;
  refreshToken: string;
  role: string;
}) {
  await Promise.all([
    SecureStore.setItemAsync(ACCESS_TOKEN_KEY, data.accessToken),
    SecureStore.setItemAsync(REFRESH_TOKEN_KEY, data.refreshToken),
    SecureStore.setItemAsync(USER_ROLE_KEY, data.role),
  ]);
}

export async function readSecureSession() {
  const [accessToken, refreshToken, role] = await Promise.all([
    SecureStore.getItemAsync(ACCESS_TOKEN_KEY),
    SecureStore.getItemAsync(REFRESH_TOKEN_KEY),
    SecureStore.getItemAsync(USER_ROLE_KEY),
  ]);

  return { accessToken, refreshToken, role };
}

export async function clearSecureSession() {
  await Promise.all([
    SecureStore.deleteItemAsync(ACCESS_TOKEN_KEY),
    SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY),
    SecureStore.deleteItemAsync(USER_ROLE_KEY),
    SecureStore.deleteItemAsync(SESSION_COOKIE_KEY).catch(() => undefined),
  ]);
}

/** Parse `Set-Cookie` from login response; persists `easyfuel.sid=...` for API requests. */
export function extractEasyfuelSessionCookie(setCookie: string | string[] | undefined): string | null {
  if (setCookie == null) {
    return null;
  }
  const lines = Array.isArray(setCookie) ? setCookie : [setCookie];
  for (const line of lines) {
    const m = String(line).match(/easyfuel\.sid=([^;]+)/);
    if (m?.[1]) {
      return `easyfuel.sid=${m[1].trim()}`;
    }
  }
  return null;
}

export async function saveSessionCookieFromSetCookie(setCookie: string | string[] | undefined) {
  const value = extractEasyfuelSessionCookie(setCookie);
  if (value) {
    await SecureStore.setItemAsync(SESSION_COOKIE_KEY, value);
  }
}

export async function readSessionCookie(): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(SESSION_COOKIE_KEY);
  } catch {
    return null;
  }
}

export async function saveThemeMode(mode: "light" | "dark") {
  await SecureStore.setItemAsync(THEME_MODE_KEY, mode);
}

export async function readThemeMode(): Promise<"light" | "dark" | null> {
  const mode = await SecureStore.getItemAsync(THEME_MODE_KEY);
  if (mode === "light" || mode === "dark") {
    return mode;
  }
  return null;
}
