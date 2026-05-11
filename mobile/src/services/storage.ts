import * as SecureStore from "expo-secure-store";

const ACCESS_TOKEN_KEY = "easy_fuel_access_token";
const REFRESH_TOKEN_KEY = "easy_fuel_refresh_token";
const USER_ROLE_KEY = "easy_fuel_user_role";
const USER_ID_KEY = "easy_fuel_user_id";
const USER_EMAIL_KEY = "easy_fuel_user_email";
const THEME_MODE_KEY = "easy_fuel_theme_mode";

export async function saveSecureSession(data: {
  accessToken: string;
  refreshToken: string;
  role: string;
  userId: string;
  email: string;
}) {
  await Promise.all([
    SecureStore.setItemAsync(ACCESS_TOKEN_KEY, data.accessToken),
    SecureStore.setItemAsync(REFRESH_TOKEN_KEY, data.refreshToken),
    SecureStore.setItemAsync(USER_ROLE_KEY, data.role),
    SecureStore.setItemAsync(USER_ID_KEY, data.userId),
    SecureStore.setItemAsync(USER_EMAIL_KEY, data.email),
  ]);
}

export async function readSecureSession() {
  const [accessToken, refreshToken, role, userId, email] = await Promise.all([
    SecureStore.getItemAsync(ACCESS_TOKEN_KEY),
    SecureStore.getItemAsync(REFRESH_TOKEN_KEY),
    SecureStore.getItemAsync(USER_ROLE_KEY),
    SecureStore.getItemAsync(USER_ID_KEY),
    SecureStore.getItemAsync(USER_EMAIL_KEY),
  ]);

  return { accessToken, refreshToken, role, userId, email };
}

export async function clearSecureSession() {
  await Promise.all([
    SecureStore.deleteItemAsync(ACCESS_TOKEN_KEY),
    SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY),
    SecureStore.deleteItemAsync(USER_ROLE_KEY),
    SecureStore.deleteItemAsync(USER_ID_KEY),
    SecureStore.deleteItemAsync(USER_EMAIL_KEY),
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
