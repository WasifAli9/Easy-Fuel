import { useEffect, useRef } from "react";
import { QueryClient, useQueryClient } from "@tanstack/react-query";
import { appConfig } from "@/services/config";
import { useSessionStore } from "@/store/session-store";
import * as Notifications from "expo-notifications";
import Constants from "expo-constants";
import { apiClient } from "@/services/api/client";
import { navigateToNotificationTarget } from "@/navigation/navigationRef";

/** Build ws:// or wss:// URL from the same host as the REST API. */
export function getWebSocketUrl(accessToken: string): string {
  const explicit = process.env.EXPO_PUBLIC_WS_URL?.trim();
  if (explicit) {
    const sep = explicit.includes("?") ? "&" : "?";
    return `${explicit}${sep}token=${encodeURIComponent(accessToken)}`;
  }
  try {
    const base = appConfig.apiBaseUrl.replace(/\/$/, "");
    const u = new URL(base);
    u.protocol = u.protocol === "https:" ? "wss:" : "ws:";
    u.pathname = "/ws";
    u.search = "";
    u.hash = "";
    return `${u.toString()}?token=${encodeURIComponent(accessToken)}`;
  } catch {
    return "";
  }
}

function invalidateForMessage(
  queryClient: QueryClient,
  role: "customer" | "driver" | "supplier" | "company" | null,
  raw: unknown,
) {
  let msg: Record<string, unknown>;
  try {
    msg = typeof raw === "string" ? (JSON.parse(raw) as Record<string, unknown>) : (raw as Record<string, unknown>);
  } catch {
    return;
  }
  const type = String(msg.type ?? (msg.payload as Record<string, unknown> | undefined)?.type ?? "");
  const orderId =
    (msg.orderId as string) ||
    ((msg.payload as Record<string, unknown> | undefined)?.orderId as string | undefined);

  const invalidate = (key: (string | Record<string, unknown>)[]) => {
    void queryClient.invalidateQueries({ queryKey: key });
  };

  if (
    type === "order_updated" ||
    type === "order_created" ||
    type === "order_state_changed" ||
    type === "driver_offer_received" ||
    type === "order_update"
  ) {
    if (role === "customer" || role === "company") {
      invalidate(["/api/orders"]);
      if (orderId) invalidate(["/api/orders", orderId]);
    }
    if (role === "driver") {
      invalidate(["/api/driver/assigned-orders"]);
      invalidate(["/api/driver/completed-orders"]);
    }
  }

  if (
    type === "driver_depot_order_placed" ||
    type === "driver_depot_order_confirmed" ||
    type === "driver_depot_order_fulfilled" ||
    type === "driver_depot_order_cancelled"
  ) {
    if (role === "supplier") {
      invalidate(["/api/supplier/driver-depot-orders"]);
    }
    if (role === "driver") {
      invalidate(["/api/driver/depot-orders"]);
    }
  }

  if (type === "depot_created" || type === "depot_updated" || type === "depot_deleted" || type === "pricing_updated") {
    if (role === "supplier") {
      invalidate(["/api/supplier/depots"]);
    }
  }

  if (
    type === "kyc_approved" ||
    type === "compliance_approved" ||
    type === "kyb_approved" ||
    type === "document_approved" ||
    type === "document_rejected"
  ) {
    if (role === "supplier") {
      invalidate(["/api/supplier/profile"]);
      invalidate(["/api/supplier/documents"]);
      invalidate(["/api/supplier/compliance/status"]);
    }
  }

  if (type === "customer_profile_updated" && role === "customer") {
    invalidate(["/api/profile"]);
  }
}

/** Keeps React Query caches aligned with the same WebSocket events the web app uses. */
export function useAppWebSocket() {
  const accessToken = useSessionStore((s) => s.accessToken);
  const role = useSessionStore((s) => s.role);
  const queryClient = useQueryClient();
  const wsRef = useRef<WebSocket | null>(null);
  const registeredRef = useRef(false);

  useEffect(() => {
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowAlert: true,
        shouldPlaySound: true,
        shouldSetBadge: true,
        shouldShowBanner: true,
        shouldShowList: true,
      }),
    });
  }, []);

  useEffect(() => {
    if (!accessToken || registeredRef.current) return;
    let cancelled = false;

    const registerPush = async () => {
      try {
        const permissions = await Notifications.getPermissionsAsync();
        let status = permissions.status;
        if (status !== "granted") {
          const next = await Notifications.requestPermissionsAsync();
          status = next.status;
        }
        if (status !== "granted") return;

        const projectId =
          Constants.expoConfig?.extra?.eas?.projectId ??
          Constants.easConfig?.projectId;
        const tokenResponse = await Notifications.getExpoPushTokenAsync(projectId ? { projectId } : undefined);
        if (cancelled || !tokenResponse?.data) return;

        await apiClient.post("/api/push/subscribe", {
          expoPushToken: tokenResponse.data,
          userAgent: "mobile-expo",
        });
        registeredRef.current = true;
      } catch {
        // Non-fatal; app continues with websocket/in-app notifications.
      }
    };

    void registerPush();
    return () => {
      cancelled = true;
    };
  }, [accessToken]);

  useEffect(() => {
    const recv = Notifications.addNotificationReceivedListener((notification) => {
      invalidateForMessage(queryClient, role, {
        type: "notification",
        payload: notification.request.content.data,
      });
    });
    const resp = Notifications.addNotificationResponseReceivedListener((response) => {
      const payload = response.notification.request.content.data;
      navigateToNotificationTarget(payload);
      invalidateForMessage(queryClient, role, { type: "notification", payload });
    });

    return () => {
      recv.remove();
      resp.remove();
    };
  }, [queryClient, role]);

  useEffect(() => {
    if (!accessToken) {
      wsRef.current?.close();
      wsRef.current = null;
      return;
    }

    const url = getWebSocketUrl(accessToken);
    if (!url || url.includes("undefined")) {
      return;
    }

    let ws: WebSocket;
    try {
      ws = new WebSocket(url);
    } catch {
      return;
    }
    wsRef.current = ws;

    ws.onmessage = (ev) => {
      invalidateForMessage(queryClient, role, ev.data);
    };

    ws.onerror = () => {
      // Connection issues are expected on flaky networks; polling still refreshes data.
    };

    return () => {
      ws.close();
      if (wsRef.current === ws) {
        wsRef.current = null;
      }
    };
  }, [accessToken, role, queryClient]);
}
