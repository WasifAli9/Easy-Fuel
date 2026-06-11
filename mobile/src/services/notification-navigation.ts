import type { UserRole } from "@/navigation/types";
import { navigationRef } from "@/navigation/navigationRef";
import { useNotificationDeepLinkStore, type NotificationDeepLink } from "@/store/notification-deep-link-store";

function isSupplierDepotNotification(data: Record<string, unknown>): boolean {
  const type = String(data.type ?? "");
  const entityType = String(data.entityType ?? "");
  const action = String(data.action ?? "");
  return (
    entityType === "depot_order" ||
    action === "open_depot_order" ||
    type.startsWith("supplier_depot") ||
    type.startsWith("supplier_payment") ||
    type.startsWith("supplier_signature") ||
    type === "supplier_order_completed" ||
    type === "driver_depot_order_placed" ||
    type === "driver_depot_order_confirmed" ||
    type === "driver_depot_payment_verified" ||
    type === "driver_depot_order_released"
  );
}

function extractDeepLink(data: Record<string, unknown> | undefined): NotificationDeepLink | null {
  if (!data) return null;

  const orderId =
    (data.orderId as string) ||
    (data.order_id as string) ||
    ((data.payload as Record<string, unknown> | undefined)?.orderId as string) ||
    undefined;

  const depotOrderId =
    (data.depotOrderId as string) ||
    (data.depot_order_id as string) ||
    (isSupplierDepotNotification(data) ? orderId : undefined);

  const type = String(data.type ?? "");
  const action = String(data.action ?? "");
  const openChat =
    type === "chat_message" ||
    type === "new_message" ||
    action === "view_chat" ||
    action === "open_chat" ||
    Boolean(data.openChat);

  const openOrder =
    type === "driver_offers_available" ||
    type === "driver_assigned" ||
    type === "order_created" ||
    action === "open_order" ||
    action === "view_order";

  const openDepotOrders = isSupplierDepotNotification(data);

  const notificationId = (data.notificationId as string) || undefined;

  if (!orderId && !depotOrderId && !notificationId && !openChat && !openOrder) {
    return null;
  }

  return {
    orderId,
    depotOrderId,
    openChat,
    openDepotOrders,
    notificationId,
  };
}

export function queueNotificationNavigation(data: Record<string, unknown> | undefined) {
  const link = extractDeepLink(data);
  if (!link) return;
  useNotificationDeepLinkStore.getState().setPending(link);
}

function mobileNavigationRole(role: UserRole | "admin" | "company" | null | undefined): UserRole | null {
  if (!role || role === "admin" || role === "company") return null;
  return role;
}

export function navigateFromNotificationPayload(
  role: UserRole | "admin" | "company" | null | undefined,
  data: Record<string, unknown> | undefined,
) {
  const appRole = mobileNavigationRole(role);
  queueNotificationNavigation(data);

  if (!navigationRef.isReady()) return;

  if (appRole === "driver") {
    navigationRef.navigate("DriverHome");
    return;
  }
  if (appRole === "supplier") {
    navigationRef.navigate("SupplierHome");
    return;
  }
  navigationRef.navigate("CustomerRoot");
}
