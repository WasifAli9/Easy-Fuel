import { useEffect, useRef } from "react";
import { QueryClient, useQueryClient } from "@tanstack/react-query";
import { appConfig } from "@/services/config";
import { useSessionStore } from "@/store/session-store";
import * as Notifications from "expo-notifications";
import Constants from "expo-constants";
import { apiClient } from "@/services/api/client";
import { readSessionCookie } from "@/services/storage";
import { navigateToNotificationTarget } from "@/navigation/navigationRef";

/**
 * Build ws:// or wss:// URL from the same host as the REST API.
 * `sessionCookie` is the raw `easyfuel.sid=...` header value — RN WebSocket cannot send Cookie headers,
 * so the server accepts it as `easyfuel_cookie` query (see server/websocket.ts).
 */
export function getWebSocketUrl(accessToken: string, sessionCookie?: string | null): string {
  const explicit = process.env.EXPO_PUBLIC_WS_URL?.trim();
  const cookieQs =
    sessionCookie && sessionCookie.trim().length > 0
      ? `&easyfuel_cookie=${encodeURIComponent(sessionCookie.trim())}`
      : "";
  if (explicit) {
    const sep = explicit.includes("?") ? "&" : "?";
    return `${explicit}${sep}token=${encodeURIComponent(accessToken)}${cookieQs}`;
  }
  try {
    const base = appConfig.apiBaseUrl.replace(/\/$/, "");
    const u = new URL(base);
    u.protocol = u.protocol === "https:" ? "wss:" : "ws:";
    u.pathname = "/ws";
    u.search = "";
    u.hash = "";
    return `${u.toString()}?token=${encodeURIComponent(accessToken)}${cookieQs}`;
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
  let type = String(msg.type ?? "");
  let payload = msg.payload as Record<string, unknown> | undefined;
  if (type === "order_update" && payload && typeof payload === "object" && typeof payload.type === "string") {
    type = payload.type;
  }
  if (!type && payload && typeof payload.type === "string") {
    type = payload.type;
  }
  const orderId =
    (msg.orderId as string) ||
    (payload?.orderId as string | undefined) ||
    (payload?.order_id as string | undefined);

  const invalidate = (key: (string | Record<string, unknown>)[]) => {
    void queryClient.invalidateQueries({ queryKey: key });
  };

  /** Match web `useRealtimeUpdates`: refresh list, detail, and driver-quote queries. */
  const invalidateCustomerOrderBundles = (oid?: string) => {
    if (role !== "customer" && role !== "company") return;
    invalidate(["/api/orders"]);
    if (oid) {
      invalidate(["/api/orders", oid]);
      invalidate(["/api/orders", oid, "offers"]);
    }
  };

  if (
    type === "order_updated" ||
    type === "order_created" ||
    type === "order_state_changed" ||
    type === "order_cancelled" ||
    type === "driver_offer_received" ||
    type === "driver_offers_available" ||
    type === "order_update"
  ) {
    invalidateCustomerOrderBundles(orderId);
    if (role === "driver") {
      invalidate(["/api/driver/assigned-orders"]);
      invalidate(["/api/driver/completed-orders"]);
      invalidate(["/api/driver/offers"]);
    }
    if (role === "supplier") {
      invalidate(["/api/supplier/orders"]);
      invalidate(["/api/supplier/driver-depot-orders"]);
    }
  }

  if (
    type === "offer_created" ||
    type === "offer_updated" ||
    type === "offer_accepted" ||
    type === "offer_rejected" ||
    type === "dispatch_offer"
  ) {
    if (role === "driver") {
      invalidate(["/api/driver/offers"]);
      invalidate(["/api/driver/assigned-orders"]);
    }
    invalidateCustomerOrderBundles(orderId);
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

  if (type === "chat_message" || type === "new_message") {
    const threadId =
      (payload?.threadId as string | undefined) ||
      (payload?.thread_id as string | undefined);
    if (orderId) {
      invalidate(["/api/chat/thread", orderId]);
    }
    if (threadId) {
      invalidate(["/api/chat/messages", threadId]);
    }
  }

  if (type === "notification") {
    invalidate(["/api/notifications"]);
    invalidate(["/api/notifications/unread-count"]);
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

    let cancelled = false;
    let ws: WebSocket | null = null;

    void (async () => {
      const cookie = await readSessionCookie();
      if (cancelled) return;
      const url = getWebSocketUrl(accessToken, cookie);
      if (!url || url.includes("undefined")) {
        return;
      }
      try {
        ws = new WebSocket(url);
      } catch {
        return;
      }
      if (cancelled) {
        ws.close();
        return;
      }
      wsRef.current = ws;

      ws.onmessage = (ev) => {
        invalidateForMessage(queryClient, role, ev.data);
      };

      ws.onerror = () => {
        // Connection issues are expected on flaky networks; polling still refreshes data.
      };
    })();

    return () => {
      cancelled = true;
      if (ws) {
        ws.close();
      }
      if (wsRef.current === ws) {
        wsRef.current = null;
      }
    };
  }, [accessToken, role, queryClient]);
}
