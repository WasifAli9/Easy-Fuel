import { notificationService, type CreateNotificationParams } from "./notification-service";

/**
 * Safely send a notification without blocking the primary operation
 * Logs failures but doesn't throw
 */
export async function notifySafely(
  notificationFn: () => Promise<string | null>,
  context: { operation: string; userId?: string; orderId?: string; [key: string]: any }
): Promise<void> {
  try {
    await notificationFn();
  } catch (error) {
    // Notification failed silently
  }
}

/**
 * Send multiple notifications safely using Promise.allSettled
 * Returns count of successful and failed notifications
 */
export async function notifyMultipleSafely(
  notifications: Array<{ fn: () => Promise<string | null>; context: Record<string, any> }>
): Promise<{ successful: number; failed: number }> {
  const results = await Promise.allSettled(
    notifications.map(({ fn }) => 
      fn().catch(() => null)
    )
  );

  const successful = results.filter(r => r.status === "fulfilled" && r.value !== null).length;
  const failed = results.length - successful;

  return { successful, failed };
}

// ===== ORDER NOTIFICATION HELPERS =====

export const orderNotifications = {
  /**
   * Notify when a new order is created
   */
  async onCreate(customerId: string, orderId: string, fuelType: string, litres: number) {
    await notifySafely(
      () => notificationService.notifyOrderCreated(customerId, orderId, fuelType, litres),
      { operation: "order_created", customerId, orderId }
    );
  },

  /**
   * Notify when order requires payment
   */
  async onAwaitingPayment(customerId: string, orderId: string, amount: number, currency: string) {
    await notifySafely(
      () => notificationService.notifyOrderAwaitingPayment(customerId, orderId, amount, currency),
      { operation: "order_awaiting_payment", customerId, orderId }
    );
  },

  /**
   * Notify when payment is confirmed
   */
  async onPaid(customerId: string, orderId: string) {
    await notifySafely(
      () => notificationService.notifyOrderPaid(customerId, orderId),
      { operation: "order_paid", customerId, orderId }
    );
  },

  /**
   * Notify customer when driver is assigned and driver when customer accepts offer
   */
  async onDriverAssigned(customerId: string, driverId: string, orderId: string, driverName: string, driverPhone: string) {
    await notifyMultipleSafely([
      {
        fn: () => notificationService.notifyDriverAssigned(customerId, orderId, driverName, driverPhone),
        context: { operation: "notify_customer_driver_assigned", customerId, orderId },
      },
      {
        fn: () => notificationService.notifyOrderAcceptedByCustomer(driverId, orderId),
        context: { operation: "notify_driver_order_accepted", driverId, orderId },
      },
    ]);
  },

  /**
   * Notify customer when driver starts delivery
   */
  async onDriverEnRoute(customerId: string, orderId: string, driverName: string, eta: string) {
    await notifySafely(
      () => notificationService.notifyDriverEnRoute(customerId, orderId, driverName, eta),
      { operation: "driver_en_route", customerId, orderId }
    );
  },

  /**
   * Notify customer when driver arrives
   */
  async onDriverArrived(customerId: string, orderId: string, driverName: string) {
    await notifySafely(
      () => notificationService.notifyDriverArrived(customerId, orderId, driverName),
      { operation: "driver_arrived", customerId, orderId }
    );
  },

  /**
   * Notify customer when delivery is complete
   */
  async onDeliveryComplete(customerId: string, orderId: string, litres: number, fuelType: string) {
    await notifySafely(
      () => notificationService.notifyDeliveryComplete(customerId, orderId, litres, fuelType),
      { operation: "delivery_complete", customerId, orderId }
    );
  },

  /**
   * Notify when order is cancelled
   */
  async onCancelled(userId: string, orderId: string, reason: string) {
    await notifySafely(
      () => notificationService.notifyOrderCancelled(userId, orderId, reason),
      { operation: "order_cancelled", userId, orderId }
    );
  },
};

// ===== DISPATCH OFFER NOTIFICATION HELPERS =====

export const offerNotifications = {
  /**
   * Notify driver when they receive a dispatch offer
   */
  async onOfferReceived(
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
    await notifySafely(
      () => notificationService.notifyDispatchOffer(
        driverId, offerId, orderId, fuelType, litres, earnings, currency, pickupAddress, deliveryAddress
      ),
      { operation: "dispatch_offer_received", driverId, offerId, orderId }
    );
  },

  /**
   * Notify customer when driver submits an offer
   */
  async onDriverOffer(
    customerId: string,
    offerId: string,
    orderId: string,
    driverName: string,
    price: number,
    currency: string,
    eta: string
  ) {
    await notifySafely(
      () => notificationService.notifyDriverOffer(customerId, offerId, orderId, driverName, price, currency, eta),
      { operation: "driver_offer_received", customerId, offerId, orderId }
    );
  },

  /**
   * Notify driver when customer accepts their offer
   */
  async onCustomerAccepted(driverId: string, offerId: string, orderId: string) {
    await notifySafely(
      () => notificationService.notifyCustomerAcceptedOffer(driverId, offerId, orderId),
      { operation: "customer_accepted_offer", driverId, offerId, orderId }
    );
  },

  /**
   * Notify driver when customer declines their offer
   */
  async onCustomerDeclined(driverId: string, offerId: string) {
    await notifySafely(
      () => notificationService.notifyCustomerDeclinedOffer(driverId, offerId),
      { operation: "customer_declined_offer", driverId, offerId }
    );
  },

  /**
   * Notify driver when their offer is about to expire
   */
  async onTimeoutWarning(driverId: string, offerId: string, minutesLeft: number) {
    await notifySafely(
      () => notificationService.notifyOfferTimeoutWarning(driverId, offerId, minutesLeft),
      { operation: "offer_timeout_warning", driverId, offerId }
    );
  },

  /**
   * Notify driver when their offer has expired
   */
  async onExpired(driverId: string, offerId: string) {
    await notifySafely(
      () => notificationService.notifyOfferExpired(driverId, offerId),
      { operation: "offer_expired", driverId, offerId }
    );
  },
};

// ===== CHAT NOTIFICATION HELPERS =====

export const chatNotifications = {
  /**
   * Notify recipient of a new chat message
   */
  async onNewMessage(
    recipientId: string,
    senderId: string,
    senderName: string,
    senderType: "customer" | "driver",
    message: string,
    orderId: string,
    threadId: string
  ) {
    await notifySafely(
      () => notificationService.notifyNewMessage(
        recipientId, senderId, senderName, senderType, message, orderId, threadId
      ),
      { operation: "new_chat_message", recipientId, senderId, threadId }
    );
  },
};

// ===== SUPPLIER NOTIFICATION HELPERS =====

export const supplierNotifications = {
  /**
   * Notify supplier of a new order
   */
  async onNewOrder(supplierId: string, orderId: string, fuelType: string, litres: number, pickupTime: string) {
    await notifySafely(
      () => notificationService.notifySupplierNewOrder(supplierId, orderId, fuelType, litres, pickupTime),
      { operation: "supplier_new_order", supplierId, orderId }
    );
  },

  /**
   * Notify supplier of low stock
   */
  async onStockLow(supplierId: string, fuelType: string, currentStock: number, threshold: number) {
    await notifySafely(
      () => notificationService.notifySupplierStockLow(supplierId, fuelType, currentStock, threshold),
      { operation: "supplier_stock_low", supplierId, fuelType }
    );
  },

  /**
   * Notify supplier of critical stock level
   */
  async onStockCritical(supplierId: string, fuelType: string, currentStock: number) {
    await notifySafely(
      () => notificationService.notifySupplierStockCritical(supplierId, fuelType, currentStock),
      { operation: "supplier_stock_critical", supplierId, fuelType }
    );
  },

  /**
   * Notify driver when order is ready for pickup
   */
  async onOrderReady(driverId: string, orderId: string, supplierName: string) {
    await notifySafely(
      () => notificationService.notifySupplierOrderReadyForPickup(driverId, orderId, supplierName),
      { operation: "order_ready_for_pickup", driverId, orderId }
    );
  },
};

// ===== PAYMENT NOTIFICATION HELPERS =====

export const paymentNotifications = {
  /**
   * Notify when payment is received
   */
  async onPaymentReceived(userId: string, amount: number, currency: string, orderId?: string) {
    await notifySafely(
      () => notificationService.notifyPaymentReceived(userId, amount, currency, orderId),
      { operation: "payment_received", userId, orderId }
    );
  },

  /**
   * Notify when payment fails
   */
  async onPaymentFailed(userId: string, amount: number, currency: string, reason: string, orderId?: string) {
    await notifySafely(
      () => notificationService.notifyPaymentFailed(userId, amount, currency, reason, orderId),
      { operation: "payment_failed", userId, orderId }
    );
  },

  /**
   * Notify driver when payout is completed
   */
  async onPayoutCompleted(driverId: string, amount: number, currency: string) {
    await notifySafely(
      () => notificationService.notifyPayoutCompleted(driverId, amount, currency),
      { operation: "payout_completed", driverId }
    );
  },
};

// ===== ACCOUNT NOTIFICATION HELPERS =====

export const accountNotifications = {
  /**
   * Notify when account is approved
   */
  async onAccountApproved(userId: string, role: string) {
    await notifySafely(
      () => notificationService.notifyAccountApproved(userId, role),
      { operation: "account_approved", userId, role }
    );
  },

  /**
   * Notify when account is rejected
   */
  async onAccountRejected(userId: string, role: string, reason: string) {
    await notifySafely(
      () => notificationService.notifyAccountRejected(userId, role, reason),
      { operation: "account_rejected", userId, role }
    );
  },

  /**
   * Notify when account is suspended
   */
  async onAccountSuspended(userId: string, reason: string) {
    await notifySafely(
      () => notificationService.notifyAccountSuspended(userId, reason),
      { operation: "account_suspended", userId }
    );
  },
};
