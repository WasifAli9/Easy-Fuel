/**
 * Payment risk controls: unpaid-order blocking, bank-detail gates, Ozow diagnostics.
 */
import { and, eq, isNull } from "drizzle-orm";
import { db } from "./db";
import { orders, suppliers } from "@shared/schema";
import {
  getDriverBankDetails,
  getSupplierBankDetailsForDepotOrder,
} from "./payment-service";
import { isOzowConfigured, isOzowPayinDryRun, envFlagEnabled } from "./ozow-service";
import { isOzowPayoutConfigured, payoutNotificationUrl, payoutVerificationUrl } from "./ozow-payout-service";

export class PaymentBlockedError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

export function bankDetailsErrorMessage(role: "driver" | "supplier"): string {
  if (role === "driver") {
    return "Driver bank details are incomplete. Complete KYC banking section before accepting or receiving payouts.";
  }
  return "Supplier bank details are incomplete. Complete KYB banking section before accepting depot orders or receiving payouts.";
}

export async function assertDriverHasBankForPayout(driverId: string): Promise<void> {
  const bank = await getDriverBankDetails(driverId);
  if (!bank) {
    throw new PaymentBlockedError("driver_bank_incomplete", bankDetailsErrorMessage("driver"));
  }
}

export async function assertSupplierHasBankForPayout(supplierId: string): Promise<void> {
  const rows = await db
    .select({
      bankAccountName: suppliers.bankAccountName,
      accountNumber: suppliers.accountNumber,
      branchCode: suppliers.branchCode,
    })
    .from(suppliers)
    .where(eq(suppliers.id, supplierId))
    .limit(1);
  const s = rows[0];
  if (!s?.bankAccountName || !s.accountNumber || !s.branchCode) {
    throw new PaymentBlockedError("supplier_bank_incomplete", bankDetailsErrorMessage("supplier"));
  }
}

export async function assertSupplierHasBankForDepot(depotId: string): Promise<void> {
  const ctx = await getSupplierBankDetailsForDepotOrder(depotId);
  if (!ctx) {
    throw new PaymentBlockedError("supplier_bank_incomplete", bankDetailsErrorMessage("supplier"));
  }
}

/** Orders where fuel was delivered but customer has not paid yet. */
export async function getUnpaidDeliveredOrdersForCustomer(customerId: string) {
  return db
    .select({
      id: orders.id,
      totalCents: orders.totalCents,
      deliveredAt: orders.deliveredAt,
      createdAt: orders.createdAt,
    })
    .from(orders)
    .where(
      and(
        eq(orders.customerId, customerId),
        eq(orders.state, "awaiting_payment"),
        isNull(orders.paidAt),
      ),
    );
}

export async function assertCustomerCanPlaceOrder(customerId: string): Promise<void> {
  const unpaid = await getUnpaidDeliveredOrdersForCustomer(customerId);
  if (unpaid.length > 0) {
    throw new PaymentBlockedError(
      "unpaid_deliveries",
      `You have ${unpaid.length} order(s) awaiting payment. Please pay before placing a new order.`,
    );
  }
}

export async function assertCustomerCanAcceptOffer(customerId: string): Promise<void> {
  await assertCustomerCanPlaceOrder(customerId);
}

export function getOzowIntegrationDiagnostics() {
  let publicUrl: string | null = null;
  try {
    publicUrl = process.env.PUBLIC_APP_URL || null;
  } catch {
    publicUrl = null;
  }

  return {
    payinConfigured: isOzowConfigured(),
    payoutConfigured: isOzowPayoutConfigured(),
    payinDryRun: isOzowPayinDryRun(),
    payoutDryRun: envFlagEnabled("OZOW_PAYOUT_DRY_RUN"),
    webhookSkipVerify: envFlagEnabled("OZOW_WEBHOOK_SKIP_VERIFY") && envFlagEnabled("OZOW_IS_TEST"),
    siteCode: process.env.OZOW_SITE_CODE ? "set" : "missing",
    clientId: process.env.OZOW_CLIENT_ID ? "set" : "missing",
    clientSecret: process.env.OZOW_CLIENT_SECRET ? "set" : "missing",
    payoutApiKey: process.env.OZOW_PAYOUT_API_KEY || process.env.OZOW_API_KEY ? "set" : "missing",
    privateKey: process.env.OZOW_PRIVATE_KEY || process.env.OZOW_API_PRIVATE_KEY ? "set" : "missing",
    oneApiBaseUrl: process.env.OZOW_ONE_API_BASE_URL || "https://stagingone.ozow.com",
    publicAppUrl: publicUrl,
    payinWebhookUrl: publicUrl ? `${publicUrl.replace(/\/$/, "")}/api/webhooks/ozow-payin` : null,
    payoutNotificationUrl: publicUrl ? payoutNotificationUrl() : null,
    payoutVerificationUrl: publicUrl ? payoutVerificationUrl() : null,
    isTest: envFlagEnabled("OZOW_IS_TEST"),
    raw: {
      OZOW_PAYIN_DRY_RUN: process.env.OZOW_PAYIN_DRY_RUN ?? null,
      OZOW_IS_TEST: process.env.OZOW_IS_TEST ?? null,
      OZOW_PAYOUT_DRY_RUN: process.env.OZOW_PAYOUT_DRY_RUN ?? null,
    },
  };
}
