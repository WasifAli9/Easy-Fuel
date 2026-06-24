/**
 * Public payment webhooks (no session auth). OZOW calls GET or POST with query/body fields.
 */
import type { Request, Response } from "express";
import { verifyWebhookPayload, type OzowWebhookPayload } from "./ozow-service";
import { findPaymentTransactionByReference } from "./payment-service";
import { completePaymentFromWebhook } from "./payment-ledger-service";
import {
  verifyPayoutRequest,
  markPayoutCompleted,
  markPayoutFailed,
  getPayoutById,
} from "./ozow-payout-service";

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

function gatewayRefFromPayload(payload: OzowWebhookPayload): string | undefined {
  const p = payload as Record<string, unknown>;
  const keys = ["OptionalTransactionId", "TransactionId", "TransactionID", "OzowTransactionId", "ozowTransactionId"];
  for (const k of keys) {
    const v = p[k];
    if (v !== undefined && v !== null && String(v).trim() !== "") return String(v);
  }
  return undefined;
}

/** Unified Ozow pay-in webhook for customer orders and depot orders. */
export async function handleOzowPayinWebhook(req: Request, res: Response) {
  try {
    const flat = flattenIncoming(req);
    const { valid, payload } = verifyWebhookPayload(flat);
    if (!valid || !payload) {
      return res.status(401).json({ error: "Invalid OZOW webhook signature" });
    }

    const ledgerTx = await findPaymentTransactionByReference(payload.TransactionReference);
    if (ledgerTx) {
      const gatewayRef = gatewayRefFromPayload(payload);
      await completePaymentFromWebhook(
        ledgerTx.id,
        payload.Status,
        gatewayRef,
        flat as Record<string, unknown>,
      );
      return res.status(200).json({ ok: true, context: ledgerTx.contextType });
    }

    return res.status(200).json({ ok: true, ignored: true });
  } catch (e) {
    console.error("[ozow-payin]", e);
    return res.status(500).json({ error: "Webhook processing failed" });
  }
}

/** Ozow payout verification – approve if access token and amount match. */
export async function handleOzowPayoutVerificationWebhook(req: Request, res: Response) {
  try {
    const flat = flattenIncoming(req);
    const body = { ...flat, ...(req.body as object) } as Record<string, unknown>;

    if (!(await verifyPayoutRequest(body))) {
      return res.status(401).json({ verified: false, error: "Invalid access token" });
    }

    const payoutId = String(body.payoutId || body.PayoutId || body.reference || body.Reference || "");
    const payout = payoutId ? await getPayoutById(payoutId) : null;

    if (payout) {
      const requestedAmount = Number(body.amount || body.Amount || 0);
      const expectedRands = payout.amountCents / 100;
      if (requestedAmount > 0 && Math.abs(requestedAmount - expectedRands) > 0.01) {
        return res.status(200).json({ verified: false, reason: "Amount mismatch" });
      }
    }

    return res.status(200).json({ verified: true });
  } catch (e) {
    console.error("[ozow-payout-verification]", e);
    return res.status(500).json({ verified: false, error: "Verification failed" });
  }
}

/** Ozow payout notification – update payout status. */
export async function handleOzowPayoutNotificationWebhook(req: Request, res: Response) {
  try {
    const flat = flattenIncoming(req);
    const body = { ...flat, ...(req.body as object) } as Record<string, unknown>;

    const payoutId = String(
      body.payoutId || body.PayoutId || body.id || body.Id || body.reference || "",
    );
    const status = String(body.status || body.Status || "").toLowerCase();
    const raw = flat as Record<string, unknown>;

    if (!payoutId) {
      return res.status(200).json({ ok: true, ignored: true });
    }

    if (status === "complete" || status === "completed" || status === "success") {
      await markPayoutCompleted(payoutId, raw);
    } else if (status === "failed" || status === "error" || status === "cancelled") {
      await markPayoutFailed(payoutId, raw);
    }

    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error("[ozow-payout-notification]", e);
    return res.status(500).json({ error: "Webhook processing failed" });
  }
}
