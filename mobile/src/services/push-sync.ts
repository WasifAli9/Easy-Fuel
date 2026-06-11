import { registerForPushNotifications } from "@/services/notifications";
import { subscribeExpoPushTokenOnServer, unsubscribeExpoPushTokenOnServer } from "@/services/push-subscribe";

let lastSyncedToken: string | null = null;
let syncInFlight: Promise<boolean> | null = null;

const RETRY_DELAYS_MS = [0, 1_500, 5_000, 15_000];

async function sleep(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

/** Register Expo push token with backend (retries on transient failures). */
export async function syncPushTokenWithServer(role?: string | null): Promise<boolean> {
  if (syncInFlight) {
    return syncInFlight;
  }

  syncInFlight = (async () => {
    for (let attempt = 0; attempt < RETRY_DELAYS_MS.length; attempt += 1) {
      if (attempt > 0) {
        await sleep(RETRY_DELAYS_MS[attempt]!);
      }

      const token = await registerForPushNotifications();
      if (!token) {
        continue;
      }

      const ok = await subscribeExpoPushTokenOnServer(token, role);
      if (ok) {
        lastSyncedToken = token;
        if (__DEV__) {
          console.log("[push] Token registered with server", role ? `(${role})` : "");
        }
        return true;
      }
    }

    if (__DEV__) {
      console.warn("[push] Token registration failed after retries");
    }
    return false;
  })();

  try {
    return await syncInFlight;
  } finally {
    syncInFlight = null;
  }
}

export function getLastSyncedPushToken(): string | null {
  return lastSyncedToken;
}

export async function clearPushTokenFromServer(): Promise<void> {
  const token = lastSyncedToken;
  if (!token) return;
  await unsubscribeExpoPushTokenOnServer(token);
  lastSyncedToken = null;
}
