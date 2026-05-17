import { createNavigationContainerRef } from "@react-navigation/native";
import type { UserRole } from "@/navigation/types";
import { navigateFromNotificationPayload } from "@/services/notification-navigation";

export const navigationRef = createNavigationContainerRef<any>();

export function navigateToNotificationTarget(payload: Record<string, unknown>, role?: UserRole | null) {
  navigateFromNotificationPayload(role ?? null, payload);
}
