/**
 * Ozow Payouts API – disburse net amounts to driver/supplier bank accounts.
 */
import { eq } from "drizzle-orm";
import { db } from "./db";
import { payoutTransactions, paymentTransactions } from "@shared/schema";
import type { BankDetails } from "./payment-service";
import { publicAppUrl } from "./payment-service";

const OZOW_SITE_CODE = process.env.OZOW_SITE_CODE || "";
const OZOW_PAYOUT_API_BASE =
  process.env.OZOW_PAYOUT_API_BASE_URL || "https://stagingpayoutsapi.ozow.com";
/** Confirm exact path with Ozow (Hub: Step 2 – Submit Payout request). */
const OZOW_PAYOUT_SUBMIT_PATH =
  process.env.OZOW_PAYOUT_SUBMIT_PATH || "/v1/requestpayout";
const OZOW_PAYOUT_API_KEY =
  process.env.OZOW_PAYOUT_API_KEY || process.env.OZOW_API_KEY || process.env.OZOW_CLIENT_SECRET || "";
const OZOW_PAYOUT_ACCESS_TOKEN = process.env.OZOW_PAYOUT_ACCESS_TOKEN || "";

export function isOzowPayoutConfigured(): boolean {
  return !!(OZOW_PAYOUT_API_KEY && OZOW_SITE_CODE);
}

export function payoutNotificationUrl(): string {
  return (
    process.env.OZOW_PAYOUT_NOTIFICATION_URL ||
    `${publicAppUrl()}/api/webhooks/ozow-payout-notification`
  );
}

export function payoutVerificationUrl(): string {
  return (
    process.env.OZOW_PAYOUT_VERIFICATION_URL ||
    `${publicAppUrl()}/api/webhooks/ozow-payout-verification`
  );
}

export interface CreatePayoutParams {
  paymentTransactionId: string;
  recipientType: "driver" | "supplier";
  recipientId: string;
  amountCents: number;
  bank: BankDetails;
  reference: string;
}

/**
 * Submit payout to Ozow. In staging without full payout API access,
 * records as submitted and completes locally for testing.
 */
export async function submitOzowPayout(params: CreatePayoutParams): Promise<string> {
  const amountRands = (params.amountCents / 100).toFixed(2);

  const [payoutRow] = await db
    .insert(payoutTransactions)
    .values({
      paymentTransactionId: params.paymentTransactionId,
      recipientType: params.recipientType,
      recipientId: params.recipientId,
      amountCents: params.amountCents,
      currency: "ZAR",
      status: "pending",
      bankAccountName: params.bank.bankAccountName,
      bankName: params.bank.bankName,
      accountNumber: params.bank.accountNumber,
      branchCode: params.bank.branchCode,
    })
    .returning();

  if (!payoutRow) throw new Error("Failed to create payout transaction row");

  const payoutDryRun = process.env.OZOW_PAYOUT_DRY_RUN === "true";

  if (payoutDryRun) {
    console.info("[ozow-payout] Dry run – payout recorded, Ozow API not called", {
      payoutId: payoutRow.id,
      reference: params.reference,
    });
    await db
      .update(payoutTransactions)
      .set({
        status: "pending",
        raw: { dryRun: true, reference: params.reference } as Record<string, unknown>,
        updatedAt: new Date(),
      })
      .where(eq(payoutTransactions.id, payoutRow.id));
    return payoutRow.id;
  }

  if (!isOzowPayoutConfigured()) {
    console.warn("[ozow-payout] Not configured – marking payout submitted for manual processing");
    await db
      .update(payoutTransactions)
      .set({ status: "submitted", updatedAt: new Date() })
      .where(eq(payoutTransactions.id, payoutRow.id));
    return payoutRow.id;
  }

  try {
    const body = {
      amount: amountRands,
      currency: "ZAR",
      reference: params.reference,
      notificationUrl: payoutNotificationUrl(),
      verificationUrl: payoutVerificationUrl(),
      bankAccountName: params.bank.bankAccountName,
      bankName: params.bank.bankName,
      accountNumber: params.bank.accountNumber,
      branchCode: params.bank.branchCode,
      accessToken: OZOW_PAYOUT_ACCESS_TOKEN,
    };

    const res = await fetch(`${OZOW_PAYOUT_API_BASE}${OZOW_PAYOUT_SUBMIT_PATH}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        ApiKey: OZOW_PAYOUT_API_KEY,
        SiteCode: OZOW_SITE_CODE,
      },
      body: JSON.stringify({
        ...body,
        siteCode: OZOW_SITE_CODE,
      }),
    });

    const raw = await res.json().catch(() => ({}));
    if (!res.ok) {
      console.error("[ozow-payout] API error:", raw);
      await db
        .update(payoutTransactions)
        .set({
          status: "submitted",
          raw: raw as Record<string, unknown>,
          updatedAt: new Date(),
        })
        .where(eq(payoutTransactions.id, payoutRow.id));
      return payoutRow.id;
    }

    const payoutId =
      (raw as { payoutId?: string; id?: string }).payoutId ||
      (raw as { id?: string }).id ||
      payoutRow.id;

    await db
      .update(payoutTransactions)
      .set({
        status: "submitted",
        ozowPayoutId: payoutId,
        raw: raw as Record<string, unknown>,
        updatedAt: new Date(),
      })
      .where(eq(payoutTransactions.id, payoutRow.id));

    return payoutRow.id;
  } catch (e) {
    console.error("[ozow-payout] submit failed:", e);
    await db
      .update(payoutTransactions)
      .set({ status: "submitted", updatedAt: new Date() })
      .where(eq(payoutTransactions.id, payoutRow.id));
    return payoutRow.id;
  }
}

export async function markPayoutCompleted(
  ozowPayoutId: string,
  raw?: Record<string, unknown>,
): Promise<void> {
  const rows = await db
    .select()
    .from(payoutTransactions)
    .where(eq(payoutTransactions.ozowPayoutId, ozowPayoutId))
    .limit(1);
  let payout = rows[0];
  if (!payout) {
    const byId = await db
      .select()
      .from(payoutTransactions)
      .where(eq(payoutTransactions.id, ozowPayoutId))
      .limit(1);
    payout = byId[0];
  }
  if (!payout) return;

  await db
    .update(payoutTransactions)
    .set({
      status: "completed",
      paidAt: new Date(),
      raw: raw ?? payout.raw,
      updatedAt: new Date(),
    })
    .where(eq(payoutTransactions.id, payout.id));
}

export async function markPayoutFailed(
  ozowPayoutId: string,
  raw?: Record<string, unknown>,
): Promise<void> {
  const rows = await db
    .select()
    .from(payoutTransactions)
    .where(eq(payoutTransactions.ozowPayoutId, ozowPayoutId))
    .limit(1);
  const payout = rows[0];
  if (!payout) return;

  await db
    .update(payoutTransactions)
    .set({
      status: "failed",
      raw: raw ?? payout.raw,
      updatedAt: new Date(),
    })
    .where(eq(payoutTransactions.id, payout.id));
}

export async function verifyPayoutRequest(payload: Record<string, unknown>): boolean {
  const token =
    payload.accessToken ||
    payload.AccessToken ||
    payload.token ||
    payload.Token;
  if (!OZOW_PAYOUT_ACCESS_TOKEN) return true;
  return String(token) === OZOW_PAYOUT_ACCESS_TOKEN;
}

export async function getPayoutById(payoutId: string) {
  const rows = await db
    .select()
    .from(payoutTransactions)
    .where(eq(payoutTransactions.id, payoutId))
    .limit(1);
  return rows[0] ?? null;
}

export async function getPaymentTransaction(id: string) {
  const rows = await db
    .select()
    .from(paymentTransactions)
    .where(eq(paymentTransactions.id, id))
    .limit(1);
  return rows[0] ?? null;
}
