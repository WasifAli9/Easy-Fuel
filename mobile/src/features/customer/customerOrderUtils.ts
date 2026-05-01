export type CustomerOrderTab = "all" | "active" | "completed";

export function formatCustomerOrderAddress(order: {
  delivery_addresses?: {
    address_street?: string | null;
    address_city?: string | null;
  } | null;
  drop_lat?: number | null;
  drop_lng?: number | null;
}): string {
  if (order.delivery_addresses) {
    const parts = [order.delivery_addresses.address_street, order.delivery_addresses.address_city].filter(Boolean);
    if (parts.length > 0) return parts.join(", ");
  }
  if (order.drop_lat != null && order.drop_lng != null) {
    return `${order.drop_lat}, ${order.drop_lng}`;
  }
  return "Address not set";
}

/** Match web CustomerDashboard hiding rules for list noise. */
export function filterOutOldCustomerOrders<T extends { state?: string; updated_at?: string; created_at?: string; delivered_at?: string }>(
  orders: T[],
): T[] {
  const twoDaysAgo = new Date();
  twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);
  const oneDayAgo = new Date();
  oneDayAgo.setDate(oneDayAgo.getDate() - 1);

  return orders.filter((order) => {
    if (order.state === "cancelled") {
      const cancelledAt = order.updated_at ? new Date(order.updated_at) : null;
      const createdAt = order.created_at ? new Date(order.created_at) : null;
      const orderDate = cancelledAt || createdAt;
      if (!orderDate) return true;
      return orderDate > oneDayAgo;
    }
    if (order.state === "delivered") {
      const deliveredAt = order.delivered_at ? new Date(order.delivered_at) : null;
      if (!deliveredAt) {
        const createdAt = order.created_at ? new Date(order.created_at) : null;
        if (!createdAt) return true;
        return createdAt > twoDaysAgo;
      }
      return deliveredAt > twoDaysAgo;
    }
    return true;
  });
}

export function filterOrdersByFuelType<T extends { fuel_types?: { id?: string } | null; fuel_type_id?: string | null }>(
  orders: T[],
  fuelTypeId: string | null,
): T[] {
  if (!fuelTypeId) return orders;
  return orders.filter((order) => {
    const id = order.fuel_types?.id || order.fuel_type_id;
    return id === fuelTypeId;
  });
}

export function filterByCustomerTab<T extends { state?: string }>(orders: T[], tab: CustomerOrderTab): T[] {
  if (tab === "active") {
    return orders.filter((o) => !["delivered", "cancelled"].includes(o.state ?? ""));
  }
  if (tab === "completed") {
    return orders.filter((o) => o.state === "delivered");
  }
  return orders;
}
