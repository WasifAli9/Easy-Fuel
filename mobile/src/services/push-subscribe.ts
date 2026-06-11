import { Platform } from "react-native";
import { apiClient } from "@/services/api/client";

export async function subscribeExpoPushTokenOnServer(
  expoPushToken: string,
  role?: string | null,
): Promise<boolean> {
  try {
    await apiClient.post("/api/push/subscribe", {
      expoPushToken,
      userAgent: `easy-fuel-mobile/${Platform.OS}${role ? `/${role}` : ""}`,
    });
    return true;
  } catch (error) {
    if (__DEV__) {
      console.warn("[push] Failed to save Expo token on server:", error);
    }
    return false;
  }
}

export async function unsubscribeExpoPushTokenOnServer(expoPushToken: string): Promise<void> {
  try {
    await apiClient.post("/api/push/unsubscribe", { expoPushToken });
  } catch {
    /* ignore */
  }
}
