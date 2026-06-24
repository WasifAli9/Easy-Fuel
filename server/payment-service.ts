/**
 * Payment fee calculation and ledger helpers for Ozow split payments.
 */
import { eq } from "drizzle-orm";
import { db } from "./db";
import {
  appSettings,
  drivers,
  paymentTransactions,
  suppliers,
  depots,
  type PaymentTransaction,
} from "@shared/schema";

export type PaymentContextType = "customer_order" | "depot_order";

export interface SplitAmounts {
  grossCents: number;
  platformFeeCents: number;
  netPayoutCents: number;
}

export async function getAppSettingsRow() {
  const rows = await db.select().from(appSettings).where(eq(appSettings.id, 1)).limit(1);
  return rows[0] ?? null;
}

/** Customer order: platform fee from customer_order_platform_fee_percent (fallback service_fee_percent). */
export async function calculateCustomerOrderSplit(
  fuelCents: number,
  deliveryCents: number,
): Promise<SplitAmounts> {
  const settings = await getAppSettingsRow();
  const percent = Number(
    settings?.customerOrderPlatformFeePercent ??
      settings?.serviceFeePercent ??
      5,
  );
  const minFee = settings?.serviceFeeMinCents ?? 0;
  const subtotal = fuelCents + deliveryCents;
  const feeFromPercent = Math.round(subtotal * (percent / 100));
  const platformFeeCents = Math.max(feeFromPercent, minFee);
  const grossCents = subtotal + platformFeeCents;
  return {
    grossCents,
    platformFeeCents,
    netPayoutCents: subtotal,
  };
}

/** Depot order: platform fee from depot_order_platform_fee_percent. */
export async function calculateDepotOrderSplit(grossCents: number): Promise<SplitAmounts> {
  const settings = await getAppSettingsRow();
  const percent = Number(settings?.depotOrderPlatformFeePercent ?? 5);
  const platformFeeCents = Math.round(grossCents * (percent / 100));
  const netPayoutCents = grossCents - platformFeeCents;
  return { grossCents, platformFeeCents, netPayoutCents };
}

export interface BankDetails {
  bankAccountName: string;
  bankName: string;
  accountNumber: string;
  branchCode: string;
  accountType?: string | null;
}

export async function getDriverBankDetails(driverId: string): Promise<BankDetails | null> {
  const rows = await db
    .select({
      bankAccountName: drivers.bankAccountName,
      bankName: drivers.bankName,
      accountNumber: drivers.accountNumber,
      branchCode: drivers.branchCode,
      accountType: drivers.accountType,
    })
    .from(drivers)
    .where(eq(drivers.id, driverId))
    .limit(1);
  const d = rows[0];
  if (!d?.bankAccountName || !d.accountNumber || !d.branchCode) return null;
  return {
    bankAccountName: d.bankAccountName,
    bankName: d.bankName ?? "",
    accountNumber: d.accountNumber,
    branchCode: d.branchCode,
    accountType: d.accountType,
  };
}

export async function getSupplierBankDetailsForDepotOrder(
  depotOrderDepotId: string,
): Promise<{ supplierId: string; bank: BankDetails } | null> {
  const depotRows = await db
    .select({ supplierId: depots.supplierId })
    .from(depots)
    .where(eq(depots.id, depotOrderDepotId))
    .limit(1);
  const supplierId = depotRows[0]?.supplierId;
  if (!supplierId) return null;

  const rows = await db
    .select({
      bankAccountName: suppliers.bankAccountName,
      bankName: suppliers.bankName,
      accountNumber: suppliers.accountNumber,
      branchCode: suppliers.branchCode,
      accountType: suppliers.accountType,
    })
    .from(suppliers)
    .where(eq(suppliers.id, supplierId))
    .limit(1);
  const s = rows[0];
  if (!s?.bankAccountName || !s.accountNumber || !s.branchCode) return null;
  return {
    supplierId,
    bank: {
      bankAccountName: s.bankAccountName,
      bankName: s.bankName ?? "",
      accountNumber: s.accountNumber,
      branchCode: s.branchCode,
      accountType: s.accountType,
    },
  };
}

export function publicAppUrl(): string {
  const base = (process.env.PUBLIC_APP_URL || "").replace(/\/$/, "");
  if (!base) throw new Error("PUBLIC_APP_URL is not configured");
  return base;
}

export function ozowPayinNotifyUrl(): string {
  return `${publicAppUrl()}/api/webhooks/ozow-payin`;
}

export async function findPaymentTransactionByReference(
  ref: string,
): Promise<PaymentTransaction | null> {
  const rows = await db
    .select()
    .from(paymentTransactions)
    .where(eq(paymentTransactions.transactionReference, ref))
    .limit(1);
  if (rows[0]) return rows[0];

  const uuidMatch = ref.match(
    /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i,
  );
  if (!uuidMatch) return null;
  const byId = await db
    .select()
    .from(paymentTransactions)
    .where(eq(paymentTransactions.id, uuidMatch[0].toLowerCase()))
    .limit(1);
  return byId[0] ?? null;
}
