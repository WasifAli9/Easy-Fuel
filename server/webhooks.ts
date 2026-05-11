/**
 * Public payment webhooks (no session auth). OZOW calls GET or POST with query/body fields.
 */
import type { Request, Response } from "express";
import { eq } from "drizzle-orm";
import { db } from "./db";
import {
  driverSubscriptions,
  drivers,
  subscriptionPayments,
  supplierSubscriptionPayments,
  supplierSubscriptions,
  suppliers,
} from "@shared/schema";
import { verifyWebhookPayload, type OzowWebhookPayload } from "./ozow-service";

const UUID_IN_REF =
  /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

function flattenIncoming(req: Request): Record<string, string | undefined> {
  const out: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(req.query)) {
    if (v === undefined) continue;
    out[k] = Array.isArray(v) ? String(v[0]) : String(v);
  }
  if (req.body && typeof req.body === "object" && !Buffer.isBuffer(req.body)) {
    for (const [k, v] of Object.entries(req.body as Record<string, unknown>)) {
      if (v === undefined || v === null) continue;
      if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") {
        out[k] = String(v);
      } else {
        out[k] = JSON.stringify(v);
      }
    }
  }
  return out;
}

/** OZOW `TransactionReference` should embed or equal our `subscription_payments.id` / `supplier_subscription_payments.id`. */
function extractEmbeddedPaymentId(ref: string): string | null {
  if (!ref?.trim()) return null;
  const m = ref.match(UUID_IN_REF);
  return m ? m[0].toLowerCase() : null;
}

function mapOzowStatusToPayment(status: string): "completed" | "failed" | "pending" {
  const s = status.toLowerCase();
  if (s === "complete" || s === "completed") return "completed";
  if (s === "pending" || s === "processing") return "pending";
  return "failed";
}

function gatewayRefFromPayload(payload: OzowWebhookPayload): string | undefined {
  const p = payload as Record<string, unknown>;
  const keys = ["OptionalTransactionId", "TransactionId", "TransactionID", "OzowTransactionId", "ozowTransactionId"];
  for (const k of keys) {
    const v = p[k];
    if (v !== undefined && v !== null && String(v).trim() !== "") return String(v);
  }
  return undefined;
}

export async function handleOzowSubscriptionWebhook(req: Request, res: Response) {
  try {
    const flat = flattenIncoming(req);
    const { valid, payload } = verifyWebhookPayload(flat);
    if (!valid || !payload) {
      return res.status(401).json({ error: "Invalid OZOW webhook signature" });
    }

    const paymentId = extractEmbeddedPaymentId(payload.TransactionReference);
    if (!paymentId) {
      if (process.env.NODE_ENV === "development") {
        console.warn("[ozow-subscription] No UUID in TransactionReference:", payload.TransactionReference);
      }
      return res.status(200).json({ ok: true, ignored: true });
    }

    const rows = await db
      .select()
      .from(subscriptionPayments)
      .where(eq(subscriptionPayments.id, paymentId))
      .limit(1);
    const payment = rows[0];
    if (!payment) {
      return res.status(200).json({ ok: true, ignored: true });
    }

    const paymentStatus = mapOzowStatusToPayment(payload.Status);
    const gatewayRef = gatewayRefFromPayload(payload);
    const rawSnapshot = { ...flat } as Record<string, unknown>;

    await db
      .update(subscriptionPayments)
      .set({
        status: paymentStatus,
        ozowTransactionId: gatewayRef ?? payment.ozowTransactionId,
        paidAt: paymentStatus === "completed" ? new Date() : payment.paidAt,
        raw: rawSnapshot,
        updatedAt: new Date(),
      })
      .where(eq(subscriptionPayments.id, paymentId));

    if (paymentStatus === "completed") {
      const subRows = await db
        .select()
        .from(driverSubscriptions)
        .where(eq(driverSubscriptions.id, payment.driverSubscriptionId))
        .limit(1);
      const sub = subRows[0];
      if (sub) {
        await db
          .update(driverSubscriptions)
          .set({
            status: "active",
            ozowTransactionId: gatewayRef ?? sub.ozowTransactionId,
            updatedAt: new Date(),
          })
          .where(eq(driverSubscriptions.id, sub.id));

        const tier =
          sub.planCode === "starter" || sub.planCode === "professional" || sub.planCode === "premium"
            ? sub.planCode
            : null;
        if (tier) {
          await db
            .update(drivers)
            .set({ subscriptionTier: tier, updatedAt: new Date() })
            .where(eq(drivers.id, sub.driverId));
        }
      }
    }

    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error("[ozow-subscription]", e);
    return res.status(500).json({ error: "Webhook processing failed" });
  }
}

export async function handleOzowSupplierSubscriptionWebhook(req: Request, res: Response) {
  try {
    const flat = flattenIncoming(req);
    const { valid, payload } = verifyWebhookPayload(flat);
    if (!valid || !payload) {
      return res.status(401).json({ error: "Invalid OZOW webhook signature" });
    }

    const paymentId = extractEmbeddedPaymentId(payload.TransactionReference);
    if (!paymentId) {
      if (process.env.NODE_ENV === "development") {
        console.warn("[ozow-supplier-subscription] No UUID in TransactionReference:", payload.TransactionReference);
      }
      return res.status(200).json({ ok: true, ignored: true });
    }

    const rows = await db
      .select()
      .from(supplierSubscriptionPayments)
      .where(eq(supplierSubscriptionPayments.id, paymentId))
      .limit(1);
    const payment = rows[0];
    if (!payment) {
      return res.status(200).json({ ok: true, ignored: true });
    }

    const paymentStatus = mapOzowStatusToPayment(payload.Status);
    const gatewayRef = gatewayRefFromPayload(payload);
    const rawSnapshot = { ...flat } as Record<string, unknown>;

    await db
      .update(supplierSubscriptionPayments)
      .set({
        status: paymentStatus,
        ozowTransactionId: gatewayRef ?? payment.ozowTransactionId,
        paidAt: paymentStatus === "completed" ? new Date() : payment.paidAt,
        raw: rawSnapshot,
        updatedAt: new Date(),
      })
      .where(eq(supplierSubscriptionPayments.id, paymentId));

    if (paymentStatus === "completed") {
      const subRows = await db
        .select()
        .from(supplierSubscriptions)
        .where(eq(supplierSubscriptions.id, payment.supplierSubscriptionId))
        .limit(1);
      const sub = subRows[0];
      if (sub) {
        await db
          .update(supplierSubscriptions)
          .set({
            status: "active",
            ozowTransactionId: gatewayRef ?? sub.ozowTransactionId,
            updatedAt: new Date(),
          })
          .where(eq(supplierSubscriptions.id, sub.id));

        const tier =
          sub.planCode === "standard" || sub.planCode === "enterprise" ? sub.planCode : null;
        if (tier) {
          await db
            .update(suppliers)
            .set({ subscriptionTier: tier, updatedAt: new Date() })
            .where(eq(suppliers.id, sub.supplierId));
        }
      }
    }

    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error("[ozow-supplier-subscription]", e);
    return res.status(500).json({ error: "Webhook processing failed" });
  }
}
