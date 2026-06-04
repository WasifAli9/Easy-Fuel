import { PropsWithChildren, useEffect, useRef } from "react";
import { Platform } from "react-native";
import * as Notifications from "expo-notifications";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import {
  navigateFromNotificationPayload,
  queueNotificationNavigation,
} from "@/services/notification-navigation";
import { registerForPushNotifications } from "@/services/notifications";
import { subscribeExpoPushTokenOnServer, unsubscribeExpoPushTokenOnServer } from "@/services/push-subscribe";

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
  const lastTokenRef = useRef<string | null>(null);

  useEffect(() => {
    if (!isAuthenticated || !user) {
      return;
    }

    let cancelled = false;

    void (async () => {
      const token = await registerForPushNotifications();
      if (cancelled || !token) return;

      lastTokenRef.current = token;
      const ok = await subscribeExpoPushTokenOnServer(token);
      if (__DEV__) {
        console.log(ok ? "[push] Token registered with server" : "[push] Token registration failed");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, user?.id]);

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
    const token = lastTokenRef.current;
    if (token) {
      void unsubscribeExpoPushTokenOnServer(token);
      lastTokenRef.current = null;
    }
  }, [isAuthenticated]);

  return <>{children}</>;
}
