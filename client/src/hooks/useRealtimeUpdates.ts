import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useWebSocket } from "./useWebSocket";
import { useAuth } from "@/contexts/AuthContext";

function invalidateAdminPortalQueries(queryClient: ReturnType<typeof useQueryClient>) {
  queryClient.invalidateQueries({ queryKey: ["/api/admin/kyc/pending"] });
  queryClient.invalidateQueries({ queryKey: ["/api/admin/customers"] });
  queryClient.invalidateQueries({ queryKey: ["/api/admin/drivers"] });
  queryClient.invalidateQueries({ queryKey: ["/api/admin/suppliers"] });
  queryClient.invalidateQueries({ queryKey: ["/api/admin/companies"] });
  queryClient.invalidateQueries({ queryKey: ["/api/admin/compliance/pending"] });
  queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
  queryClient.invalidateQueries({ queryKey: ["/api/notifications/unread-count"] });
}

function invalidateCompanyFleetQueries(queryClient: ReturnType<typeof useQueryClient>) {
  queryClient.invalidateQueries({ queryKey: ["/api/company/driver-applications"] });
  queryClient.invalidateQueries({ queryKey: ["/api/company/overview"] });
  queryClient.invalidateQueries({ queryKey: ["/api/company/drivers"] });
  queryClient.invalidateQueries({ queryKey: ["/api/company/vehicles"] });
  queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
  queryClient.invalidateQueries({ queryKey: ["/api/notifications/unread-count"] });
}

/**
 * Global hook that listens to WebSocket messages and automatically
 * invalidates React Query cache when data changes occur.
 */
export function useRealtimeUpdates() {
  const queryClient = useQueryClient();
  const { profile } = useAuth();

  useWebSocket((message) => {
    const { type, payload } = message;
    const payloadType = payload?.type as string | undefined;

    if (profile?.role === "admin") {
      if (
        type === "user_created" ||
        type === "user_updated" ||
        type === "user_deleted" ||
        type === "kyc_submitted" ||
        type === "kyc_approved" ||
        type === "kyc_rejected" ||
        type === "kyb_approved" ||
        type === "kyb_rejected" ||
        type === "admin_vehicle_review_required" ||
        type === "compliance_document_uploaded" ||
        type === "vehicle_created"
      ) {
        invalidateAdminPortalQueries(queryClient);
        if (payload?.userId) {
          queryClient.invalidateQueries({ queryKey: ["/api/admin/users", payload.userId] });
        }
        return;
      }

      if (type === "notification") {
        const nType = payloadType ?? "";
        if (
          nType === "admin_vehicle_review_required" ||
          nType === "admin_kyc_submitted" ||
          nType === "admin_document_uploaded" ||
          nType === "system_alert" ||
          nType.startsWith("admin_")
        ) {
          invalidateAdminPortalQueries(queryClient);
          return;
        }
      }
    }

    if (profile?.role === "company") {
      if (
        type === "fleet_join_application" ||
        type === "fleet_join_application_cancelled" ||
        type === "fleet_join_approved" ||
        type === "fleet_join_rejected"
      ) {
        invalidateCompanyFleetQueries(queryClient);
        return;
      }

      if (type === "notification" && payloadType?.startsWith("fleet_join")) {
        invalidateCompanyFleetQueries(queryClient);
        return;
      }
    }

    switch (type) {
      case "order_created":
      case "order_updated":
      case "order_cancelled":
      case "order_status_changed":
      case "order_state_changed":
      case "order_update":
        queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
        if (payload?.orderId) {
          queryClient.invalidateQueries({ queryKey: ["/api/orders", payload.orderId] });
          queryClient.invalidateQueries({ queryKey: ["/api/orders", payload.orderId, "offers"] });
        }
        queryClient.invalidateQueries({ queryKey: ["/api/driver/offers"] });
        queryClient.invalidateQueries({ queryKey: ["/api/driver/assigned-orders"] });
        queryClient.invalidateQueries({ queryKey: ["/api/driver/stats"] });
        queryClient.invalidateQueries({ queryKey: ["/api/supplier/orders"] });
        break;

      case "offer_created":
      case "offer_updated":
      case "offer_accepted":
      case "offer_rejected":
      case "dispatch_offer":
        queryClient.invalidateQueries({ queryKey: ["/api/driver/offers"] });
        queryClient.invalidateQueries({ queryKey: ["/api/driver/assigned-orders"] });
        queryClient.invalidateQueries({ queryKey: ["/api/driver/stats"] });
        if (payload?.orderId) {
          queryClient.invalidateQueries({ queryKey: ["/api/orders", payload.orderId] });
          queryClient.invalidateQueries({ queryKey: ["/api/orders", payload.orderId, "offers"] });
        }
        queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
        break;

      case "address_created":
      case "address_updated":
      case "address_deleted":
        queryClient.invalidateQueries({ queryKey: ["/api/delivery-addresses"] });
        queryClient.invalidateQueries({ queryKey: ["/api/addresses"] });
        break;

      case "payment_method_created":
      case "payment_method_updated":
      case "payment_method_deleted":
        queryClient.invalidateQueries({ queryKey: ["/api/payment-methods"] });
        break;

      case "vehicle_created":
      case "vehicle_updated":
      case "vehicle_deleted":
      case "vehicle_approved":
      case "vehicle_rejected":
        queryClient.invalidateQueries({ queryKey: ["/api/driver/vehicles"] });
        queryClient.invalidateQueries({ queryKey: ["/api/driver/profile"] });
        if (payload?.vehicleId) {
          queryClient.invalidateQueries({
            queryKey: ["/api/driver/vehicles", payload.vehicleId, "compliance/status"],
          });
          queryClient.invalidateQueries({
            queryKey: ["/api/driver/vehicles", payload.vehicleId, "documents"],
          });
        }
        queryClient.invalidateQueries({ queryKey: ["/api/driver/vehicles"], exact: false });
        break;

      case "driver_profile_updated":
        queryClient.invalidateQueries({ queryKey: ["/api/driver/profile"] });
        queryClient.invalidateQueries({ queryKey: ["/api/driver/stats"] });
        break;

      case "depot_created":
      case "depot_updated":
      case "depot_deleted":
        queryClient.invalidateQueries({ queryKey: ["/api/supplier/depots"] });
        break;

      case "pricing_updated":
        queryClient.invalidateQueries({ queryKey: ["/api/supplier/depots"] });
        if (payload?.depotId) {
          queryClient.invalidateQueries({ queryKey: ["/api/supplier/depots", payload.depotId] });
        }
        break;

      case "supplier_profile_updated":
        queryClient.invalidateQueries({ queryKey: ["/api/supplier/profile"] });
        break;

      case "customer_profile_updated":
        queryClient.invalidateQueries({ queryKey: ["/api/customer/profile"] });
        break;

      case "user_created":
      case "user_updated":
      case "user_deleted":
      case "kyc_approved":
      case "kyc_rejected":
      case "kyb_approved":
      case "kyb_rejected":
        invalidateAdminPortalQueries(queryClient);
        if (payload?.userId) {
          queryClient.invalidateQueries({ queryKey: ["/api/admin/users", payload.userId] });
        }
        break;

      case "notification":
        queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
        queryClient.invalidateQueries({ queryKey: ["/api/notifications/unread-count"] });
        break;

      case "chat_message":
        if (payload?.orderId) {
          queryClient.invalidateQueries({ queryKey: ["/api/chat/thread", payload.orderId] });
        }
        break;

      case "location_update":
        if (payload?.orderId) {
          queryClient.invalidateQueries({ queryKey: ["/api/orders", payload.orderId] });
        }
        break;

      case "data_refresh":
        if (payload?.queryKeys && Array.isArray(payload.queryKeys)) {
          payload.queryKeys.forEach((key: string | string[]) => {
            queryClient.invalidateQueries({ queryKey: Array.isArray(key) ? key : [key] });
          });
        } else {
          queryClient.invalidateQueries();
        }
        break;

      default:
        break;
    }
  });

  return null;
}
