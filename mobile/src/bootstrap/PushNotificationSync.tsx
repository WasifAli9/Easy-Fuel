import { PropsWithChildren, useEffect, useRef } from "react";
import { AppState, type AppStateStatus } from "react-native";
import * as Notifications from "expo-notifications";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import {
  navigateFromNotificationPayload,
  queueNotificationNavigation,
} from "@/services/notification-navigation";
import { clearPushTokenFromServer, syncPushTokenWithServer } from "@/services/push-sync";

function getNotificationData(notification: Notifications.Notification): Record<string, unknown> {
  const content = notification.request.content;
  const raw = content.data;
  if (raw && typeof raw === "object") {
    return raw as Record<string, unknown>;
  }
  return {};
}

/** Registers Expo push token with the API and handles notification taps (same backend as web). */
export function PushNotificationSync({ children }: PropsWithChildren) {
  const { user, isAuthenticated } = useAuth();
  const queryClient = useQueryClient();
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);

  useEffect(() => {
    if (!isAuthenticated || !user) {
      return;
    }

    let cancelled = false;

    void (async () => {
      await syncPushTokenWithServer(user.role);
      if (cancelled) return;
    })();

    const appStateSub = AppState.addEventListener("change", (nextState) => {
      const wasBackground = appStateRef.current.match(/inactive|background/);
      appStateRef.current = nextState;
      if (wasBackground && nextState === "active" && isAuthenticated && user) {
        void syncPushTokenWithServer(user.role);
      }
    });

    return () => {
      cancelled = true;
      appStateSub.remove();
    };
  }, [isAuthenticated, user?.id, user?.role]);

  useEffect(() => {
    if (!isAuthenticated) return;

    const receivedSub = Notifications.addNotificationReceivedListener(() => {
      void queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
      void queryClient.invalidateQueries({ queryKey: ["/api/notifications/unread-count"] });
    });

    const responseSub = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = getNotificationData(response.notification);
      navigateFromNotificationPayload(user?.role ?? null, data);
      void queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
    });

    void Notifications.getLastNotificationResponseAsync().then((response) => {
      if (!response) return;
      const data = getNotificationData(response.notification);
      queueNotificationNavigation(data);
    });

    return () => {
      receivedSub.remove();
      responseSub.remove();
    };
  }, [isAuthenticated, queryClient, user?.role]);

  useEffect(() => {
    if (isAuthenticated) return;
    void clearPushTokenFromServer();
  }, [isAuthenticated]);

  return <>{children}</>;
}
