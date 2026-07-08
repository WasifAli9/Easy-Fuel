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
  isOzowPayinDryRun,
} from "./ozow-service";
import { submitOzowPayout } from "./ozow-payout-service";
import {
  assertDriverHasBankForPayout,
  assertSupplierHasBankForPayout,
  PaymentBlockedError,
} from "./payment-risk-service";

function formatOrderDeliveryAddress(row: {
  address_street?: string | null;
  address_city?: string | null;
  address_province?: string | null;
  drop_lat?: number | null;
  drop_lng?: number | null;
}): string {
  if (row.address_street || row.address_city || row.address_province) {
    return [row.address_street, row.address_city, row.address_province].filter(Boolean).join(", ");
  }
  if (row.drop_lat != null && row.drop_lng != null) {
    return `${row.drop_lat}, ${row.drop_lng}`;
  }
  return "Address not specified";
}

function formatDateTimeForZA(date: Date | string | null | undefined): string {
  if (!date) return "Not specified";
  return new Date(date).toLocaleString("en-ZA", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Africa/Johannesburg",
  });
}

async function sendCustomerOrderPaymentReceiptEmails(
  orderId: string,
  paidAt: Date,
): Promise<void> {
  try {
    const { sendDeliveryCompletionEmail } = await import("./email-service");
    const res = await pool.query(
      `SELECT o.id, o.litres, o.total_cents, o.delivered_at, o.drop_lat, o.drop_lng,
              ft.label AS fuel_label,
              c.company_name, c.user_id AS customer_user_id,
              cp.full_name AS customer_name, lau_c.email AS customer_email,
              dp.full_name AS driver_name, lau_d.email AS driver_email,
              da.address_street, da.address_city, da.address_province
       FROM orders o
       LEFT JOIN fuel_types ft ON ft.id = o.fuel_type_id
       LEFT JOIN customers c ON c.id = o.customer_id
       LEFT JOIN profiles cp ON cp.id = c.user_id
       LEFT JOIN local_auth_users lau_c ON lau_c.id = c.user_id
       LEFT JOIN drivers dr ON dr.id = o.assigned_driver_id
       LEFT JOIN profiles dp ON dp.id = dr.user_id
       LEFT JOIN local_auth_users lau_d ON lau_d.id = dr.user_id
       LEFT JOIN delivery_addresses da ON da.id = o.delivery_address_id
       WHERE o.id = $1`,
      [orderId],
    );
    const row = res.rows[0];
    if (!row) return;

    const orderShortId = orderId.substring(0, 8).toUpperCase();
    const deliveryAddress = formatOrderDeliveryAddress(row);
    const deliveredAtFormatted = formatDateTimeForZA(row.delivered_at);
    const paidAtFormatted = formatDateTimeForZA(paidAt);
    const paymentAmount = `R ${(Number(row.total_cents || 0) / 100).toFixed(2)}`;
    const fuelTypeLabel = row.fuel_label || "Fuel";
    const litresDisplay = row.litres ? String(row.litres) : "0";
    const customerName = row.customer_name || row.company_name || "Customer";
    const driverName = row.driver_name || "Driver";

    const emailTasks: Promise<void>[] = [];

    if (row.customer_email) {
      emailTasks.push(
        sendDeliveryCompletionEmail({
          toEmail: row.customer_email,
          recipientName: customerName,
          audience: "customer",
          orderNumber: orderShortId,
          fuelType: fuelTypeLabel,
          litres: litresDisplay,
          deliveryAddress,
          deliveredAt: deliveredAtFormatted,
          driverName,
          customerName,
          paymentAmount,
          paidAt: paidAtFormatted,
        }),
      );
    }

    if (row.driver_email) {
      emailTasks.push(
        sendDeliveryCompletionEmail({
          toEmail: row.driver_email,
          recipientName: driverName,
          audience: "driver",
          orderNumber: orderShortId,
          fuelType: fuelTypeLabel,
          litres: litresDisplay,
          deliveryAddress,
          deliveredAt: deliveredAtFormatted,
          driverName,
          customerName,
          paymentAmount,
          paidAt: paidAtFormatted,
        }),
      );
    }

    if (emailTasks.length > 0) {
      await Promise.all(emailTasks);
    }
  } catch (e) {
    console.error("[payment] receipt email failed:", e);
  }
}

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

  if (isOzowPayinDryRun()) {
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
        await sendCustomerOrderPaymentReceiptEmails(order.id, new Date());
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
