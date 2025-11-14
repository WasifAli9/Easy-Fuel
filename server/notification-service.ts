import { supabaseAdmin } from "./supabase";
import { websocketService } from "./websocket";
import { pushNotificationService } from "./push-service";

export type NotificationType = 
  // Order lifecycle - Customer
  | "order_created"
  | "order_awaiting_payment"
  | "order_paid"
  | "driver_assigned"
  | "driver_en_route"
  | "driver_arrived"
  | "delivery_started"
  | "delivery_complete"
  | "order_cancelled"
  | "order_refunded"
  // Dispatch & Offers - Driver
  | "dispatch_offer_received"
  | "offer_timeout_warning"
  | "offer_expired"
  | "customer_accepted_offer"
  | "customer_declined_offer"
  // Order updates - Driver
  | "order_accepted_by_customer"
  | "pickup_ready"
  | "delivery_instructions_updated"
  // Chat - Both Customer & Driver
  | "new_message"
  | "unread_messages_reminder"
  // Payment - All roles
  | "payment_received"
  | "payment_failed"
  | "payment_processing"
  | "payout_scheduled"
  | "payout_completed"
  | "payout_failed"
  // Supplier specific
  | "new_order_for_supplier"
  | "stock_low"
  | "stock_critical"
  | "order_fulfilled"
  | "order_ready_for_pickup"
  | "supplier_rating_received"
  // Driver specific
  | "driver_rating_received"
  | "shift_reminder"
  | "document_expiring"
  | "vehicle_inspection_due"
  // Customer specific
  | "delivery_eta_update"
  | "driver_location_shared"
  | "price_estimate_available"
  | "favorite_driver_available"
  // System & Admin
  | "system_alert"
  | "account_verification_required"
  | "account_approved"
  | "account_rejected"
  | "account_suspended"
  | "terms_updated"
  | "maintenance_scheduled";

export interface CreateNotificationParams {
  userId: string;
  type: NotificationType;
  title: string;
  message: string;
  data?: any;
  priority?: "low" | "medium" | "high" | "urgent";
  requireInteraction?: boolean;
}

class NotificationService {
  /**
   * Main method to create and send a notification
   * Handles database storage, WebSocket delivery, and push notification fallback
   */
  async createAndSend(params: CreateNotificationParams): Promise<string | null> {
    const { userId, type, title, message, data, priority = "medium", requireInteraction = false } = params;

    try {
      // 1. Store notification in database
      const { data: notification, error } = await supabaseAdmin
        .from("notifications")
        .insert({
          user_id: userId,
          type,
          title,
          message,
          data,
          read: false,
          delivery_status: "pending",
        })
        .select()
        .single();

      if (error) {
        console.error("Error creating notification:", error);
        return null;
      }

      // 2. Try to send via WebSocket (real-time for online users)
      const wsDelivered = websocketService.sendNotification(userId, {
        id: notification.id,
        type,
        title,
        message,
        data,
        createdAt: notification.created_at,
      });

      // 3. If user is not connected via WebSocket, send push notification
      if (!wsDelivered) {
        await pushNotificationService.sendToUser(userId, {
          title,
          body: message,
          icon: "/icon-192.png",
          badge: "/badge-72.png",
          tag: `notification-${notification.id}`,
          requireInteraction,
          data: {
            notificationId: notification.id,
            type,
            ...data,
          },
        });

        // Update delivery status
        await supabaseAdmin
          .from("notifications")
          .update({ 
            delivery_status: "sent",
            delivered_at: new Date().toISOString()
          })
          .eq("id", notification.id);
      } else {
        // WebSocket delivered successfully
        await supabaseAdmin
          .from("notifications")
          .update({ 
            delivery_status: "sent",
            delivered_at: new Date().toISOString()
          })
          .eq("id", notification.id);
      }

      return notification.id;
    } catch (error) {
      console.error("Error in createAndSend:", error);
      return null;
    }
  }

  // ===== ORDER LIFECYCLE NOTIFICATIONS =====

  async notifyOrderCreated(customerId: string, orderId: string, fuelType: string, litres: number) {
    return this.createAndSend({
      userId: customerId,
      type: "order_created",
      title: "Order Created",
      message: `Your order for ${litres}L of ${fuelType} has been created`,
      data: { orderId },
    });
  }

  async notifyOrderAwaitingPayment(customerId: string, orderId: string, amount: number, currency: string) {
    return this.createAndSend({
      userId: customerId,
      type: "order_awaiting_payment",
      title: "Payment Required",
      message: `Please complete payment of ${currency} ${amount.toFixed(2)} for your order`,
      data: { orderId, amount, currency },
      priority: "high",
    });
  }

  async notifyOrderPaid(customerId: string, orderId: string) {
    return this.createAndSend({
      userId: customerId,
      type: "order_paid",
      title: "Payment Confirmed",
      message: "Your payment has been confirmed. Looking for available drivers...",
      data: { orderId },
    });
  }

  async notifyDriverAssigned(customerId: string, orderId: string, driverName: string, driverPhone: string) {
    return this.createAndSend({
      userId: customerId,
      type: "driver_assigned",
      title: "Driver Assigned",
      message: `${driverName} has been assigned to your delivery`,
      data: { orderId, driverName, driverPhone },
      priority: "high",
    });
  }

  async notifyDriverEnRoute(customerId: string, orderId: string, driverName: string, eta: string) {
    return this.createAndSend({
      userId: customerId,
      type: "driver_en_route",
      title: "Driver On The Way",
      message: `${driverName} is on the way. ETA: ${eta}`,
      data: { orderId, driverName, eta },
      priority: "high",
      requireInteraction: true,
    });
  }

  async notifyDriverArrived(customerId: string, orderId: string, driverName: string) {
    return this.createAndSend({
      userId: customerId,
      type: "driver_arrived",
      title: "Driver Arrived",
      message: `${driverName} has arrived at your location`,
      data: { orderId, driverName },
      priority: "urgent",
      requireInteraction: true,
    });
  }

  async notifyDeliveryComplete(customerId: string, orderId: string, litres: number, fuelType: string) {
    return this.createAndSend({
      userId: customerId,
      type: "delivery_complete",
      title: "Delivery Complete",
      message: `${litres}L of ${fuelType} has been delivered successfully`,
      data: { orderId },
    });
  }

  async notifyOrderCancelled(userId: string, orderId: string, reason: string) {
    return this.createAndSend({
      userId,
      type: "order_cancelled",
      title: "Order Cancelled",
      message: `Your order has been cancelled. Reason: ${reason}`,
      data: { orderId, reason },
    });
  }

  // ===== DISPATCH & OFFER NOTIFICATIONS (DRIVER) =====

  async notifyDispatchOffer(
    driverId: string, 
    offerId: string,
    orderId: string, 
    fuelType: string, 
    litres: number, 
    earnings: number, 
    currency: string,
    pickupAddress: string,
    deliveryAddress: string
  ) {
    return this.createAndSend({
      userId: driverId,
      type: "dispatch_offer_received",
      title: "New Delivery Available",
      message: `${litres}L ${fuelType} delivery - Earn ${currency} ${earnings.toFixed(2)}`,
      data: { offerId, orderId, fuelType, litres, earnings, currency, pickupAddress, deliveryAddress },
      priority: "urgent",
      requireInteraction: true,
    });
  }

  async notifyOfferTimeoutWarning(driverId: string, offerId: string, minutesLeft: number) {
    return this.createAndSend({
      userId: driverId,
      type: "offer_timeout_warning",
      title: "Offer Expiring Soon",
      message: `Your delivery offer expires in ${minutesLeft} minutes`,
      data: { offerId, minutesLeft },
      priority: "high",
    });
  }

  async notifyOfferExpired(driverId: string, offerId: string) {
    return this.createAndSend({
      userId: driverId,
      type: "offer_expired",
      title: "Offer Expired",
      message: "The delivery offer has expired",
      data: { offerId },
    });
  }

  async notifyCustomerAcceptedOffer(driverId: string, offerId: string, orderId: string) {
    return this.createAndSend({
      userId: driverId,
      type: "customer_accepted_offer",
      title: "Offer Accepted",
      message: "Customer accepted your offer! Proceed to pickup",
      data: { offerId, orderId },
      priority: "urgent",
      requireInteraction: true,
    });
  }

  async notifyCustomerDeclinedOffer(driverId: string, offerId: string) {
    return this.createAndSend({
      userId: driverId,
      type: "customer_declined_offer",
      title: "Offer Declined",
      message: "Customer declined your offer",
      data: { offerId },
    });
  }

  // ===== DRIVER-SPECIFIC NOTIFICATIONS =====

  async notifyOrderAcceptedByCustomer(driverId: string, orderId: string) {
    return this.createAndSend({
      userId: driverId,
      type: "order_accepted_by_customer",
      title: "Order Confirmed",
      message: "Customer confirmed the order. Start the delivery",
      data: { orderId },
      priority: "high",
    });
  }

  async notifyPickupReady(driverId: string, orderId: string, supplierName: string, supplierAddress: string) {
    return this.createAndSend({
      userId: driverId,
      type: "pickup_ready",
      title: "Pickup Ready",
      message: `Fuel is ready for pickup at ${supplierName}`,
      data: { orderId, supplierName, supplierAddress },
      priority: "high",
    });
  }

  async notifyDriverRating(driverId: string, orderId: string, rating: number, review?: string) {
    return this.createAndSend({
      userId: driverId,
      type: "driver_rating_received",
      title: "New Rating Received",
      message: review || `You received a ${rating}-star rating`,
      data: { orderId, rating, review },
    });
  }

  // ===== CUSTOMER-SPECIFIC NOTIFICATIONS =====

  async notifyDriverOffer(
    customerId: string,
    offerId: string,
    orderId: string,
    driverName: string,
    price: number,
    currency: string,
    eta: string
  ) {
    return this.createAndSend({
      userId: customerId,
      type: "driver_assigned",
      title: "Driver Offer Received",
      message: `${driverName} can deliver in ${eta} for ${currency} ${price.toFixed(2)}`,
      data: { offerId, orderId, driverName, price, currency, eta },
      priority: "high",
      requireInteraction: true,
    });
  }

  async notifyDeliveryEtaUpdate(customerId: string, orderId: string, newEta: string) {
    return this.createAndSend({
      userId: customerId,
      type: "delivery_eta_update",
      title: "Updated Delivery Time",
      message: `New estimated arrival: ${newEta}`,
      data: { orderId, newEta },
    });
  }

  // ===== CHAT NOTIFICATIONS =====

  async notifyNewMessage(
    recipientId: string,
    senderId: string,
    senderName: string,
    senderType: "customer" | "driver",
    message: string,
    orderId: string,
    threadId: string
  ) {
    return this.createAndSend({
      userId: recipientId,
      type: "new_message",
      title: senderName,
      message: message.length > 100 ? message.substring(0, 97) + "..." : message,
      data: { 
        orderId, 
        threadId, 
        senderId, 
        senderName, 
        senderType,
        fullMessage: message 
      },
      priority: "medium",
    });
  }

  // ===== SUPPLIER NOTIFICATIONS =====

  async notifySupplierNewOrder(
    supplierId: string,
    orderId: string,
    fuelType: string,
    litres: number,
    pickupTime: string
  ) {
    return this.createAndSend({
      userId: supplierId,
      type: "new_order_for_supplier",
      title: "New Order Received",
      message: `Prepare ${litres}L of ${fuelType} for pickup at ${pickupTime}`,
      data: { orderId, fuelType, litres, pickupTime },
      priority: "high",
    });
  }

  async notifySupplierStockLow(supplierId: string, fuelType: string, currentStock: number, threshold: number) {
    return this.createAndSend({
      userId: supplierId,
      type: "stock_low",
      title: "Low Stock Alert",
      message: `${fuelType} stock is low (${currentStock}L remaining)`,
      data: { fuelType, currentStock, threshold },
      priority: "medium",
    });
  }

  async notifySupplierStockCritical(supplierId: string, fuelType: string, currentStock: number) {
    return this.createAndSend({
      userId: supplierId,
      type: "stock_critical",
      title: "Critical Stock Level",
      message: `${fuelType} stock is critically low (${currentStock}L remaining)`,
      data: { fuelType, currentStock },
      priority: "urgent",
      requireInteraction: true,
    });
  }

  async notifySupplierOrderReadyForPickup(driverId: string, orderId: string, supplierName: string) {
    return this.createAndSend({
      userId: driverId,
      type: "order_ready_for_pickup",
      title: "Order Ready",
      message: `Your order is ready for pickup at ${supplierName}`,
      data: { orderId, supplierName },
      priority: "high",
    });
  }

  // ===== PAYMENT NOTIFICATIONS =====

  async notifyPaymentReceived(userId: string, amount: number, currency: string, orderId?: string) {
    return this.createAndSend({
      userId,
      type: "payment_received",
      title: "Payment Received",
      message: `Payment of ${currency} ${amount.toFixed(2)} has been received`,
      data: { amount, currency, orderId },
    });
  }

  async notifyPaymentFailed(userId: string, amount: number, currency: string, reason: string, orderId?: string) {
    return this.createAndSend({
      userId,
      type: "payment_failed",
      title: "Payment Failed",
      message: `Payment of ${currency} ${amount.toFixed(2)} failed: ${reason}`,
      data: { amount, currency, reason, orderId },
      priority: "high",
    });
  }

  async notifyPayoutCompleted(driverId: string, amount: number, currency: string) {
    return this.createAndSend({
      userId: driverId,
      type: "payout_completed",
      title: "Payout Completed",
      message: `${currency} ${amount.toFixed(2)} has been transferred to your account`,
      data: { amount, currency },
    });
  }

  // ===== SYSTEM NOTIFICATIONS =====

  async notifyAccountApproved(userId: string, role: string) {
    return this.createAndSend({
      userId,
      type: "account_approved",
      title: "Account Approved",
      message: `Your ${role} account has been approved. You can now start using Easy Fuel ZA`,
      data: { role },
      priority: "high",
    });
  }

  async notifyAccountRejected(userId: string, role: string, reason: string) {
    return this.createAndSend({
      userId,
      type: "account_rejected",
      title: "Account Not Approved",
      message: `Your ${role} account application was not approved. Reason: ${reason}`,
      data: { role, reason },
      priority: "high",
    });
  }

  async notifyAccountSuspended(userId: string, reason: string) {
    return this.createAndSend({
      userId,
      type: "account_suspended",
      title: "Account Suspended",
      message: `Your account has been suspended. Reason: ${reason}`,
      data: { reason },
      priority: "urgent",
      requireInteraction: true,
    });
  }

  async notifySystemAlert(userId: string, title: string, message: string, data?: any) {
    return this.createAndSend({
      userId,
      type: "system_alert",
      title,
      message,
      data,
      priority: "high",
    });
  }

  // ===== BULK NOTIFICATIONS =====

  /**
   * Send notification to multiple users
   */
  async sendToMultipleUsers(userIds: string[], params: Omit<CreateNotificationParams, "userId">) {
    const promises = userIds.map(userId => 
      this.createAndSend({ ...params, userId })
    );
    
    const results = await Promise.allSettled(promises);
    const successful = results.filter(r => r.status === "fulfilled").length;
    const failed = results.filter(r => r.status === "rejected").length;
    
    return { successful, failed, total: userIds.length };
  }
}

export const notificationService = new NotificationService();
