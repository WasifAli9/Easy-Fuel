/**
 * Webhook handlers (public routes, no auth). Verify gateway signatures and update DB.
 */

import type { Request, Response } from "express";
import { verifyWebhookPayload } from "./ozow-service";
import "@shared/subscription-plans";
import { db } from "./db";
import {
  driverSubscriptions,
  drivers,
  subscriptionPayments,
  supplierSubscriptionPayments,
  supplierSubscriptions,
  suppliers,
} from "@shared/schema";
import { eq } from "drizzle-orm";

/**
 * OZOW subscription payment callback. OZOW may send GET (redirect) or POST with query/body.
 * TransactionReference format: sub_<subscription_payments.id>
 */
export async function handleOzowSubscriptionWebhook(req: Request, res: Response): Promise<void> {
  try {
    const bodyOrQuery = req.method === "GET" ? (req.query as Record<string, string>) : { ...req.query, ...req.body } as Record<string, string>;
    const { valid, payload } = verifyWebhookPayload(bodyOrQuery);
    if (!payload) {
      res.status(400).send("Invalid or missing payload");
      return;
    }
    if (!valid && process.env.OZOW_PRIVATE_KEY) {
      res.status(400).send("Invalid signature");
      return;
    }

    const ref = payload.TransactionReference;
    const status = String(payload.Status || "").toLowerCase();
    const isSuccess = status === "complete" || status === "completed" || status === "success";

    if (!ref.startsWith("sub_")) {
      res.status(200).send("OK");
      return;
    }
    const paymentId = ref.replace("sub_", "");
    if (!paymentId) {
      res.status(200).send("OK");
      return;
    }

    const paymentRows = await db
      .select({
        id: subscriptionPayments.id,
        driver_subscription_id: subscriptionPayments.driverSubscriptionId,
        status: subscriptionPayments.status,
      })
      .from(subscriptionPayments)
      .where(eq(subscriptionPayments.id, paymentId))
      .limit(1);
    const payment = paymentRows[0];
    if (!payment) {
      res.status(200).send("OK");
      return;
    }
    if (payment.status === "completed") {
      res.status(200).send("OK");
      return;
    }

    if (isSuccess) {
      const now = new Date();
      const periodStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const periodEnd = new Date(periodStart);
      periodEnd.setMonth(periodEnd.getMonth() + 1);
      const nextBilling = new Date(periodEnd);

      await db
        .update(subscriptionPayments)
        .set({
          status: "completed",
          paidAt: now,
          ozowTransactionId: payload.TransactionReference,
          raw: payload as unknown as Record<string, unknown>,
          updatedAt: now,
        })
        .where(eq(subscriptionPayments.id, payment.id));

      const subRows = await db
        .select({
          id: driverSubscriptions.id,
          driver_id: driverSubscriptions.driverId,
          plan_code: driverSubscriptions.planCode,
        })
        .from(driverSubscriptions)
        .where(eq(driverSubscriptions.id, payment.driver_subscription_id))
        .limit(1);
      const sub = subRows[0];

      if (sub) {
        await db
          .update(driverSubscriptions)
          .set({
            status: "active",
            currentPeriodStart: periodStart,
            currentPeriodEnd: periodEnd,
            nextBillingAt: nextBilling,
            ozowTransactionId: payload.TransactionReference,
            updatedAt: now,
          })
          .where(eq(driverSubscriptions.id, sub.id));

        await db
          .update(drivers)
          .set({
            premiumStatus: "active",
            subscriptionTier: sub.plan_code,
            updatedAt: now,
          })
          .where(eq(drivers.id, sub.driver_id));
      }
    } else {
      await db
        .update(subscriptionPayments)
        .set({ status: "failed", updatedAt: new Date() })
        .where(eq(subscriptionPayments.id, payment.id));
    }

    res.status(200).send("OK");
  } catch (e) {
    console.error("OZOW webhook error:", e);
    res.status(500).send("Error");
  }
}

/**
 * OZOW supplier subscription payment callback.
 * TransactionReference format: supplier_sub_<supplier_subscription_payments.id>
 */
export async function handleOzowSupplierSubscriptionWebhook(req: Request, res: Response): Promise<void> {
  try {
    const bodyOrQuery = req.method === "GET" ? (req.query as Record<string, string>) : { ...req.query, ...req.body } as Record<string, string>;
    const { valid, payload } = verifyWebhookPayload(bodyOrQuery);
    if (!payload) {
      res.status(400).send("Invalid or missing payload");
      return;
    }
    if (!valid && process.env.OZOW_PRIVATE_KEY) {
      res.status(400).send("Invalid signature");
      return;
    }

    const ref = payload.TransactionReference;
    const status = String(payload.Status || "").toLowerCase();
    const isSuccess = status === "complete" || status === "completed" || status === "success";

    if (!ref.startsWith("supplier_sub_")) {
      res.status(200).send("OK");
      return;
    }
    const paymentId = ref.replace("supplier_sub_", "");
    if (!paymentId) {
      res.status(200).send("OK");
      return;
    }

    const paymentRows = await db
      .select({
        id: supplierSubscriptionPayments.id,
        supplier_subscription_id: supplierSubscriptionPayments.supplierSubscriptionId,
        status: supplierSubscriptionPayments.status,
      })
      .from(supplierSubscriptionPayments)
      .where(eq(supplierSubscriptionPayments.id, paymentId))
      .limit(1);
    const payment = paymentRows[0];
    if (!payment) {
      res.status(200).send("OK");
      return;
    }
    if (payment.status === "completed") {
      res.status(200).send("OK");
      return;
    }

    if (isSuccess) {
      const now = new Date();
      const periodStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const periodEnd = new Date(periodStart);
      periodEnd.setMonth(periodEnd.getMonth() + 1);
      const nextBilling = new Date(periodEnd);

      await db
        .update(supplierSubscriptionPayments)
        .set({
          status: "completed",
          paidAt: now,
          ozowTransactionId: payload.TransactionReference,
          raw: payload as unknown as Record<string, unknown>,
          updatedAt: now,
        })
        .where(eq(supplierSubscriptionPayments.id, payment.id));

      const subRows = await db
        .select({
          id: supplierSubscriptions.id,
          supplier_id: supplierSubscriptions.supplierId,
          plan_code: supplierSubscriptions.planCode,
        })
        .from(supplierSubscriptions)
        .where(eq(supplierSubscriptions.id, payment.supplier_subscription_id))
        .limit(1);
      const sub = subRows[0];

      if (sub) {
        await db
          .update(supplierSubscriptions)
          .set({
            status: "active",
            currentPeriodStart: periodStart,
            currentPeriodEnd: periodEnd,
            nextBillingAt: nextBilling,
            ozowTransactionId: payload.TransactionReference,
            updatedAt: now,
          })
          .where(eq(supplierSubscriptions.id, sub.id));

        await db
          .update(suppliers)
          .set({
            subscriptionTier: sub.plan_code,
            updatedAt: now,
          })
          .where(eq(suppliers.id, sub.supplier_id));
      }
    } else {
      await db
        .update(supplierSubscriptionPayments)
        .set({ status: "failed", updatedAt: new Date() })
        .where(eq(supplierSubscriptionPayments.id, payment.id));
    }

    res.status(200).send("OK");
  } catch (e) {
    console.error("OZOW supplier subscription webhook error:", e);
    res.status(500).send("Error");
  }
}
