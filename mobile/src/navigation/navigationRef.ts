import { createNavigationContainerRef } from "@react-navigation/native";

export const navigationRef = createNavigationContainerRef<any>();

export function navigateToNotificationTarget(payload: any) {
  if (!navigationRef.isReady()) return;

  const role = payload?.role ?? null;
  const action = payload?.action ?? "";
  const orderId = payload?.orderId ?? payload?.order_id ?? payload?.entityId ?? null;
  const threadId = payload?.threadId ?? payload?.thread_id ?? null;

  if (role === "driver") {
    navigationRef.navigate("DriverHome");
    return;
  }
  if (role === "supplier") {
    navigationRef.navigate("SupplierHome");
    return;
  }
  if (role === "company") {
    navigationRef.navigate("CompanyHome");
    return;
  }

  // customer/default
  navigationRef.navigate("CustomerHome");
  // Deep entity navigation is screen-local modal based in current app structure;
  // we keep a safe root redirect and rely on realtime/query invalidation for state sync.
  void action;
  void orderId;
  void threadId;
}
