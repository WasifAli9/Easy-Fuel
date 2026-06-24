/**
 * Remind customers to pay for delivered orders (pay-after-delivery model).
 */
import { and, eq, isNull, isNotNull, lt } from "drizzle-orm";
import { db } from "./db";
import { orders, customers } from "@shared/schema";

const REMINDER_AFTER_MS = Number(process.env.PAYMENT_REMINDER_AFTER_HOURS || 24) * 60 * 60 * 1000;

export async function sendUnpaidDeliveryReminders(): Promise<{ sent: number; scanned: number }> {
  const cutoff = new Date(Date.now() - REMINDER_AFTER_MS);

  const rows = await db
    .select({
      orderId: orders.id,
      customerId: orders.customerId,
      totalCents: orders.totalCents,
      deliveredAt: orders.deliveredAt,
    })
    .from(orders)
    .where(
      and(
        eq(orders.state, "awaiting_payment"),
        isNull(orders.paidAt),
        isNotNull(orders.deliveredAt),
        lt(orders.deliveredAt, cutoff),
      ),
    );

  if (rows.length === 0) {
    return { sent: 0, scanned: 0 };
  }

  const { notificationService } = await import("./notification-service");
  let sent = 0;

  for (const row of rows) {
    if (!row.deliveredAt) continue;

    const cust = await db
      .select({ userId: customers.userId })
      .from(customers)
      .where(eq(customers.id, row.customerId))
      .limit(1);
    const userId = cust[0]?.userId;
    if (!userId) continue;

    const amount = (row.totalCents / 100).toFixed(2);
    const id = await notificationService.createNotification({
      userId,
      type: "order_awaiting_payment",
      title: "Payment reminder",
      message: `Your delivery is complete. Please pay R ${amount} to finalise order ${row.orderId.slice(0, 8).toUpperCase()}.`,
      data: { orderId: row.orderId, amount: row.totalCents / 100, currency: "ZAR" },
      dedupeKey: `payment_reminder:${row.orderId}`,
      priority: "high",
      entityType: "order",
      entityId: row.orderId,
    });
    if (id) sent += 1;
  }

  return { sent, scanned: rows.length };
}
