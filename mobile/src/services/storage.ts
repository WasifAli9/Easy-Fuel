import * as SecureStore from "expo-secure-store";

const ACCESS_TOKEN_KEY = "easy_fuel_access_token";
const REFRESH_TOKEN_KEY = "easy_fuel_refresh_token";
const USER_ROLE_KEY = "easy_fuel_user_role";
const THEME_MODE_KEY = "easy_fuel_theme_mode";

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
  ]);
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
