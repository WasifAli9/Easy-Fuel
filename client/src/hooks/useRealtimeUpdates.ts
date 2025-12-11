import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useWebSocket } from "./useWebSocket";
import { useAuth } from "@/contexts/AuthContext";

/**
 * Global hook that listens to WebSocket messages and automatically
 * invalidates React Query cache when data changes occur.
 * This ensures the UI updates in real-time without manual page refreshes.
 */
export function useRealtimeUpdates() {
  const queryClient = useQueryClient();
  const { profile } = useAuth();

  useWebSocket((message) => {
    const { type, payload } = message;

    console.log("[useRealtimeUpdates] Received WebSocket message:", { type, payload });

    // Handle different message types and invalidate relevant queries
    switch (type) {
      // Order-related updates
      case "order_created":
      case "order_updated":
      case "order_cancelled":
      case "order_status_changed":
        queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
        if (payload?.orderId) {
          queryClient.invalidateQueries({ queryKey: ["/api/orders", payload.orderId] });
          queryClient.invalidateQueries({ queryKey: ["/api/orders", payload.orderId, "offers"] });
        }
        // Also invalidate driver-specific queries
        queryClient.invalidateQueries({ queryKey: ["/api/driver/offers"] });
        queryClient.invalidateQueries({ queryKey: ["/api/driver/assigned-orders"] });
        queryClient.invalidateQueries({ queryKey: ["/api/driver/stats"] });
        queryClient.invalidateQueries({ queryKey: ["/api/supplier/orders"] });
        break;

      // Driver offer updates
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

      // Delivery address updates
      case "address_created":
      case "address_updated":
      case "address_deleted":
        queryClient.invalidateQueries({ queryKey: ["/api/delivery-addresses"] });
        queryClient.invalidateQueries({ queryKey: ["/api/addresses"] });
        break;

      // Payment method updates
      case "payment_method_created":
      case "payment_method_updated":
      case "payment_method_deleted":
        queryClient.invalidateQueries({ queryKey: ["/api/payment-methods"] });
        break;

      // Vehicle updates
      case "vehicle_created":
      case "vehicle_updated":
      case "vehicle_deleted":
      case "vehicle_approved":
      case "vehicle_rejected":
        queryClient.invalidateQueries({ queryKey: ["/api/driver/vehicles"] });
        queryClient.invalidateQueries({ queryKey: ["/api/driver/profile"] });
        // Invalidate compliance status for the specific vehicle
        if (payload?.vehicleId) {
          queryClient.invalidateQueries({ queryKey: ["/api/driver/vehicles", payload.vehicleId, "compliance/status"] });
          queryClient.invalidateQueries({ queryKey: ["/api/driver/vehicles", payload.vehicleId, "documents"] });
        }
        // Also invalidate all vehicle compliance statuses
        queryClient.invalidateQueries({ queryKey: ["/api/driver/vehicles"], exact: false });
        break;

      // Driver profile updates
      case "driver_profile_updated":
        queryClient.invalidateQueries({ queryKey: ["/api/driver/profile"] });
        queryClient.invalidateQueries({ queryKey: ["/api/driver/stats"] });
        break;

      // Supplier updates
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

      // Customer profile updates
      case "customer_profile_updated":
        queryClient.invalidateQueries({ queryKey: ["/api/customer/profile"] });
        break;

      // Admin updates
      case "user_created":
      case "user_updated":
      case "user_deleted":
      case "kyc_approved":
      case "kyc_rejected":
      case "kyb_approved":
      case "kyb_rejected":
        queryClient.invalidateQueries({ queryKey: ["/api/admin/kyc/pending"] });
        queryClient.invalidateQueries({ queryKey: ["/api/admin/customers"] });
        queryClient.invalidateQueries({ queryKey: ["/api/admin/drivers"] });
        queryClient.invalidateQueries({ queryKey: ["/api/admin/suppliers"] });
        if (payload?.userId) {
          queryClient.invalidateQueries({ queryKey: ["/api/admin/users", payload.userId] });
        }
        break;

      // Notification updates
      case "notification":
        queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
        queryClient.invalidateQueries({ queryKey: ["/api/notifications/unread-count"] });
        break;

      // Chat updates
      case "chat_message":
        if (payload?.orderId) {
          queryClient.invalidateQueries({ queryKey: ["/api/chat/thread", payload.orderId] });
        }
        break;

      // Location updates
      case "location_update":
        if (payload?.orderId) {
          queryClient.invalidateQueries({ queryKey: ["/api/orders", payload.orderId] });
        }
        break;

      // Generic data refresh - invalidate all queries
      case "data_refresh":
        if (payload?.queryKeys && Array.isArray(payload.queryKeys)) {
          payload.queryKeys.forEach((key: string | string[]) => {
            queryClient.invalidateQueries({ queryKey: Array.isArray(key) ? key : [key] });
          });
        } else {
          // If no specific keys, invalidate all
          queryClient.invalidateQueries();
        }
        break;

      default:
        // For unknown types, log but don't error
        console.log("[useRealtimeUpdates] Unhandled message type:", type);
    }
  });

  // This hook doesn't return anything - it just sets up the listener
  return null;
}

