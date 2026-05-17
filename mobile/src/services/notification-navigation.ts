import type { UserRole } from "@/navigation/types";
import { navigationRef } from "@/navigation/navigationRef";
import { useNotificationDeepLinkStore, type NotificationDeepLink } from "@/store/notification-deep-link-store";

function extractDeepLink(data: Record<string, unknown> | undefined): NotificationDeepLink | null {
  if (!data) return null;

  const orderId =
    (data.orderId as string) ||
    (data.order_id as string) ||
    ((data.payload as Record<string, unknown> | undefined)?.orderId as string) ||
    undefined;

  const type = String(data.type ?? "");
  const action = String(data.action ?? "");
  const openChat =
    type === "chat_message" ||
    type === "new_message" ||
    action === "view_chat" ||
    Boolean(data.openChat);

  const notificationId = (data.notificationId as string) || undefined;

  if (!orderId && !notificationId && !openChat) {
    return null;
  }

  return { orderId, openChat, notificationId };
}

export function queueNotificationNavigation(data: Record<string, unknown> | undefined) {
  const link = extractDeepLink(data);
  if (!link) return;
  useNotificationDeepLinkStore.getState().setPending(link);
}

function mobileNavigationRole(role: UserRole | "admin" | null | undefined): UserRole | null {
  if (!role || role === "admin") return null;
  return role;
}

export function navigateFromNotificationPayload(
  role: UserRole | "admin" | null | undefined,
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
  if (appRole === "company") {
    navigationRef.navigate("CompanyHome");
    return;
  }
  navigationRef.navigate("CustomerRoot");
}
