/**
 * Webhook handlers (public routes, no auth). Verify gateway signatures and update DB.
 */

import type { Request, Response } from "express";
import { supabaseAdmin } from "./supabase";
import { verifyWebhookPayload } from "./ozow-service";
import "@shared/subscription-plans";

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

    const { data: payment, error: payErr } = await supabaseAdmin
      .from("subscription_payments")
      .select("id, driver_subscription_id, status")
      .eq("id", paymentId)
      .single();

    if (payErr || !payment) {
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

      await supabaseAdmin
        .from("subscription_payments")
        .update({
          status: "completed",
          paid_at: now.toISOString(),
          ozow_transaction_id: payload.TransactionReference,
          raw: payload as unknown as Record<string, unknown>,
          updated_at: now.toISOString(),
        })
        .eq("id", payment.id);

      const { data: sub } = await supabaseAdmin
        .from("driver_subscriptions")
        .select("id, driver_id, plan_code")
        .eq("id", payment.driver_subscription_id)
        .single();

      if (sub) {
        await supabaseAdmin
          .from("driver_subscriptions")
          .update({
            status: "active",
            current_period_start: periodStart.toISOString(),
            current_period_end: periodEnd.toISOString(),
            next_billing_at: nextBilling.toISOString(),
            ozow_transaction_id: payload.TransactionReference,
            updated_at: now.toISOString(),
          })
          .eq("id", sub.id);

        await supabaseAdmin
          .from("drivers")
          .update({
            premium_status: "active",
            subscription_tier: sub.plan_code,
            updated_at: now.toISOString(),
          })
          .eq("id", sub.driver_id);
      }
    } else {
      await supabaseAdmin
        .from("subscription_payments")
        .update({ status: "failed", updated_at: new Date().toISOString() })
        .eq("id", payment.id);
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

    const { data: payment, error: payErr } = await supabaseAdmin
      .from("supplier_subscription_payments")
      .select("id, supplier_subscription_id, status")
      .eq("id", paymentId)
      .single();

    if (payErr || !payment) {
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

      await supabaseAdmin
        .from("supplier_subscription_payments")
        .update({
          status: "completed",
          paid_at: now.toISOString(),
          ozow_transaction_id: payload.TransactionReference,
          raw: payload as unknown as Record<string, unknown>,
          updated_at: now.toISOString(),
        })
        .eq("id", payment.id);

      const { data: sub } = await supabaseAdmin
        .from("supplier_subscriptions")
        .select("id, supplier_id, plan_code")
        .eq("id", payment.supplier_subscription_id)
        .single();

      if (sub) {
        await supabaseAdmin
          .from("supplier_subscriptions")
          .update({
            status: "active",
            current_period_start: periodStart.toISOString(),
            current_period_end: periodEnd.toISOString(),
            next_billing_at: nextBilling.toISOString(),
            ozow_transaction_id: payload.TransactionReference,
            updated_at: now.toISOString(),
          })
          .eq("id", sub.id);

        await supabaseAdmin
          .from("suppliers")
          .update({
            subscription_tier: sub.plan_code,
            updated_at: now.toISOString(),
          })
          .eq("id", sub.supplier_id);
      }
    } else {
      await supabaseAdmin
        .from("supplier_subscription_payments")
        .update({ status: "failed", updated_at: new Date().toISOString() })
        .eq("id", payment.id);
    }

    res.status(200).send("OK");
  } catch (e) {
    console.error("OZOW supplier subscription webhook error:", e);
    res.status(500).send("Error");
  }
}
