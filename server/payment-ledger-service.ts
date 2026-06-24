/**
 * Create pay-in sessions, complete webhooks, and trigger payouts.
 */
import { eq } from "drizzle-orm";
import { db, pool } from "./db";
import {
  orders,
  paymentTransactions,
  customers,
  profiles,
  localAuthUsers,
} from "@shared/schema";
import {
  calculateCustomerOrderSplit,
  calculateDepotOrderSplit,
  getDriverBankDetails,
  getSupplierBankDetailsForDepotOrder,
  type PaymentContextType,
} from "./payment-service";
import {
  createOzowPayIn,
  defaultCancelUrl,
  defaultSuccessUrl,
  isOzowConfigured,
} from "./ozow-service";
import { submitOzowPayout } from "./ozow-payout-service";
import {
  assertDriverHasBankForPayout,
  assertSupplierHasBankForPayout,
  PaymentBlockedError,
} from "./payment-risk-service";

export async function initiateCustomerOrderPayment(
  orderId: string,
  payerUserId: string,
): Promise<{ paymentUrl: string; paymentTransactionId: string }> {
  if (!isOzowConfigured()) {
    throw new Error("Online payment is not available. Ozow is not configured.");
  }

  const orderRows = await db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
  const order = orderRows[0];
  if (!order) throw new Error("Order not found");
  if (order.state !== "awaiting_payment") {
    throw new Error("Payment is only available after the driver completes delivery");
  }
  if (order.paidAt) throw new Error("Order is already paid");

  const split = await calculateCustomerOrderSplit(
    Math.round(order.fuelPriceCents * Number(order.litres)),
    order.deliveryFeeCents,
  );
  const grossCents = order.totalCents > 0 ? order.totalCents : split.grossCents;
  const platformFeeCents =
    order.serviceFeeCents > 0 ? order.serviceFeeCents : split.platformFeeCents;
  const netPayoutCents = grossCents - platformFeeCents;

  if (!order.assignedDriverId) throw new Error("No driver assigned to this order");

  await assertDriverHasBankForPayout(order.assignedDriverId);

  const [tx] = await db
    .insert(paymentTransactions)
    .values({
      contextType: "customer_order",
      contextId: orderId,
      payerUserId,
      payeeType: "driver",
      payeeId: order.assignedDriverId,
      grossCents,
      platformFeeCents,
      netPayoutCents,
      currency: "ZAR",
      status: "pending",
      transactionReference: orderId,
    })
    .returning();

  if (!tx) throw new Error("Failed to create payment transaction");

  const customerRows = await db
    .select({ companyName: customers.companyName, userId: customers.userId })
    .from(customers)
    .where(eq(customers.id, order.customerId))
    .limit(1);
  const profileRows = customerRows[0]?.userId
    ? await db
        .select({
          fullName: profiles.fullName,
          email: localAuthUsers.email,
        })
        .from(profiles)
        .leftJoin(localAuthUsers, eq(localAuthUsers.id, profiles.id))
        .where(eq(profiles.id, customerRows[0].userId))
        .limit(1)
    : [];

  const ozow = await createOzowPayIn({
    amountRands: grossCents / 100,
    transactionReference: tx.id,
    bankReference: orderId.replace(/-/g, "").slice(0, 20),
    customerName: profileRows[0]?.fullName || customerRows[0]?.companyName || undefined,
    customerEmail: profileRows[0]?.email || undefined,
    successUrl: defaultSuccessUrl("customer_order", orderId),
    cancelUrl: defaultCancelUrl("customer_order", orderId),
  });

  await db
    .update(paymentTransactions)
    .set({
      ozowPaymentUrl: ozow.paymentUrl,
      updatedAt: new Date(),
    })
    .where(eq(paymentTransactions.id, tx.id));

  await db
    .update(orders)
    .set({ paymentTransactionId: tx.id, updatedAt: new Date() })
    .where(eq(orders.id, orderId));

  if (process.env.OZOW_PAYIN_DRY_RUN === "true" && process.env.OZOW_IS_TEST === "true") {
    await completePaymentFromWebhook(tx.id, "Complete", "payin-dry-run", { dryRun: true });
  }

  return { paymentUrl: ozow.paymentUrl, paymentTransactionId: tx.id };
}

export async function initiateDepotOrderPayment(
  orderId: string,
  driverUserId: string,
): Promise<{ paymentUrl: string; paymentTransactionId: string }> {
  if (!isOzowConfigured()) {
    throw new Error("Online payment is not available. Ozow is not configured.");
  }

  const orderRes = await pool.query(
    `SELECT o.*, d.supplier_id AS depot_supplier_id
     FROM driver_depot_orders o
     JOIN depots d ON d.id = o.depot_id
     WHERE o.id = $1`,
    [orderId],
  );
  const order = orderRes.rows[0];
  if (!order) throw new Error("Order not found");

  const driverRes = await pool.query(`SELECT id FROM drivers WHERE user_id = $1`, [driverUserId]);
  const driverId = driverRes.rows[0]?.id;
  if (!driverId || order.driver_id !== driverId) throw new Error("Order not found");

  if (order.status !== "pending_payment") {
    throw new Error(`Order status must be pending_payment. Current: ${order.status}`);
  }

  const grossCents = order.total_price_cents;
  const split = await calculateDepotOrderSplit(grossCents);
  const supplierId = order.depot_supplier_id;

  await assertSupplierHasBankForPayout(supplierId);

  const [tx] = await db
    .insert(paymentTransactions)
    .values({
      contextType: "depot_order",
      contextId: orderId,
      payerUserId: driverUserId,
      payeeType: "supplier",
      payeeId: supplierId,
      grossCents: split.grossCents,
      platformFeeCents: split.platformFeeCents,
      netPayoutCents: split.netPayoutCents,
      currency: "ZAR",
      status: "pending",
      transactionReference: orderId,
    })
    .returning();

  if (!tx) throw new Error("Failed to create payment transaction");

  const profileRows = await db
    .select({
      fullName: profiles.fullName,
      email: localAuthUsers.email,
    })
    .from(profiles)
    .leftJoin(localAuthUsers, eq(localAuthUsers.id, profiles.id))
    .where(eq(profiles.id, driverUserId))
    .limit(1);

  const ozow = await createOzowPayIn({
    amountRands: grossCents / 100,
    transactionReference: tx.id,
    bankReference: orderId.replace(/-/g, "").slice(0, 20),
    customerName: profileRows[0]?.fullName || undefined,
    customerEmail: profileRows[0]?.email || undefined,
    successUrl: defaultSuccessUrl("depot_order", orderId),
    cancelUrl: defaultCancelUrl("depot_order", orderId),
  });

  await db
    .update(paymentTransactions)
    .set({ ozowPaymentUrl: ozow.paymentUrl, updatedAt: new Date() })
    .where(eq(paymentTransactions.id, tx.id));

  await pool.query(
    `UPDATE driver_depot_orders
     SET payment_method = 'online_payment',
         payment_status = 'pending_payment',
         payment_transaction_id = $2,
         updated_at = now()
     WHERE id = $1`,
    [orderId, tx.id],
  );

  return { paymentUrl: ozow.paymentUrl, paymentTransactionId: tx.id };
}

function mapOzowStatus(status: string): "completed" | "failed" | "pending" {
  const s = status.toLowerCase();
  if (s === "complete" || s === "completed" || s === "success") return "completed";
  if (s === "pending" || s === "processing") return "pending";
  return "failed";
}

export async function completePaymentFromWebhook(
  paymentTxId: string,
  ozowStatus: string,
  gatewayRef?: string,
  raw?: Record<string, unknown>,
): Promise<void> {
  const status = mapOzowStatus(ozowStatus);
  const txRows = await db
    .select()
    .from(paymentTransactions)
    .where(eq(paymentTransactions.id, paymentTxId))
    .limit(1);
  const tx = txRows[0];
  if (!tx) return;
  if (tx.status === "completed") return;

  await db
    .update(paymentTransactions)
    .set({
      status,
      ozowTransactionId: gatewayRef ?? tx.ozowTransactionId,
      paidAt: status === "completed" ? new Date() : tx.paidAt,
      raw: raw ?? tx.raw,
      updatedAt: new Date(),
    })
    .where(eq(paymentTransactions.id, paymentTxId));

  if (status !== "completed") return;

  if (tx.contextType === "customer_order") {
    await db
      .update(orders)
      .set({
        state: "delivered",
        paidAt: new Date(),
        paymentTransactionId: tx.id,
        updatedAt: new Date(),
      })
      .where(eq(orders.id, tx.contextId));

    try {
      const { cleanupChatForOrder } = await import("./chat-service");
      await cleanupChatForOrder(tx.contextId);
    } catch (e) {
      console.error("[payment] chat cleanup failed:", e);
    }

    if (tx.payeeId && tx.netPayoutCents > 0) {
      const bank = await getDriverBankDetails(tx.payeeId);
      if (bank) {
        await submitOzowPayout({
          paymentTransactionId: tx.id,
          recipientType: "driver",
          recipientId: tx.payeeId,
          amountCents: tx.netPayoutCents,
          bank,
          reference: `order-${tx.contextId}`,
        });
      } else {
        console.warn("[payment] Driver bank details missing for payout:", tx.payeeId);
        try {
          const { notificationService } = await import("./notification-service");
          const drv = await pool.query(`SELECT user_id FROM drivers WHERE id = $1`, [tx.payeeId]);
          const adminMsg = "Driver payout pending — bank details missing in KYC.";
          if (drv.rows[0]?.user_id) {
            await notificationService.createNotification({
              userId: drv.rows[0].user_id,
              type: "payout_failed",
              title: "Payout blocked",
              message: adminMsg,
              data: { orderId: tx.contextId },
              entityType: "order",
              entityId: tx.contextId,
            });
          }
        } catch (e) {
          console.error("[payment] payout blocked notification failed:", e);
        }
      }
    }

    try {
      const { notificationService } = await import("./notification-service");
      const orderRows = await db.select().from(orders).where(eq(orders.id, tx.contextId)).limit(1);
      const order = orderRows[0];
      if (order) {
        const cust = await db
          .select({ userId: customers.userId })
          .from(customers)
          .where(eq(customers.id, order.customerId))
          .limit(1);
        if (cust[0]?.userId) {
          await notificationService.notifyOrderPaid(cust[0].userId, order.id);
        }
        if (order.assignedDriverId) {
          const drv = await pool.query(`SELECT user_id FROM drivers WHERE id = $1`, [
            order.assignedDriverId,
          ]);
          const driverUserId = drv.rows[0]?.user_id;
          if (driverUserId) {
            await notificationService.createNotification({
              userId: driverUserId,
              type: "payout_scheduled",
              title: "Payout processing",
              message: "Your delivery payment is being transferred to your bank account.",
              data: { orderId: order.id },
              entityType: "order",
              entityId: order.id,
            });
          }
        }
      }
    } catch (e) {
      console.error("[payment] notification failed:", e);
    }
  }

  if (tx.contextType === "depot_order") {
    await pool.query(
      `UPDATE driver_depot_orders
       SET payment_status = 'payment_verified',
           status = 'ready_for_pickup',
           payment_confirmed_at = now(),
           updated_at = now()
       WHERE id = $1`,
      [tx.contextId],
    );

    const depotOrderRes = await pool.query(
      `SELECT depot_id FROM driver_depot_orders WHERE id = $1`,
      [tx.contextId],
    );
    const depotId = depotOrderRes.rows[0]?.depot_id;

    if (depotId && tx.netPayoutCents > 0) {
      const supplierBank = await getSupplierBankDetailsForDepotOrder(depotId);
      if (supplierBank) {
        await submitOzowPayout({
          paymentTransactionId: tx.id,
          recipientType: "supplier",
          recipientId: supplierBank.supplierId,
          amountCents: tx.netPayoutCents,
          bank: supplierBank.bank,
          reference: `depot-${tx.contextId}`,
        });
      } else {
        console.warn("[payment] Supplier bank details missing for depot payout:", depotId);
      }
    }

    try {
      const { notificationService } = await import("./notification-service");
      const depotRes = await pool.query(
        `SELECT o.litres, o.driver_id, d.name AS depot_name, ft.label AS fuel_label, ft.code AS fuel_code,
                dr.user_id AS driver_user_id
         FROM driver_depot_orders o
         JOIN depots d ON d.id = o.depot_id
         JOIN fuel_types ft ON ft.id = o.fuel_type_id
         JOIN drivers dr ON dr.id = o.driver_id
         WHERE o.id = $1`,
        [tx.contextId],
      );
      const row = depotRes.rows[0];
      if (row?.driver_user_id) {
        await notificationService.notifyDriverDepotPaymentVerified(
          row.driver_user_id,
          tx.contextId,
          row.depot_name || "Depot",
          row.fuel_label || row.fuel_code || "fuel",
          parseFloat(row.litres || "0"),
        );
      }
    } catch (e) {
      console.error("[payment] depot notification failed:", e);
    }
  }
}

export type { PaymentContextType };
export { PaymentBlockedError };
