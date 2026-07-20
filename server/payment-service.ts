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

export const DEFAULT_FEE_PER_LITRE_CENTS = 100; // R1.00/L

export async function getAppSettingsRow() {
  try {
    const rows = await db.select().from(appSettings).where(eq(appSettings.id, 1)).limit(1);
    return rows[0] ?? null;
  } catch (e: any) {
    // Schema may be ahead of DB (new columns not migrated yet)
    if (!String(e?.message || e).includes("column")) throw e;
    const { pool } = await import("./db");
    const r = await pool.query(`SELECT * FROM app_settings WHERE id = 1 LIMIT 1`);
    const row = r.rows[0];
    if (!row) return null;
    return {
      id: row.id,
      serviceFeePercent: row.service_fee_percent,
      serviceFeeMinCents: row.service_fee_min_cents,
      baseDeliveryFeeCents: row.base_delivery_fee_cents,
      pricePerKmCents: row.price_per_km_cents,
      dispatchRadiusKm: row.dispatch_radius_km,
      dispatchSlaSeconds: row.dispatch_sla_seconds,
      driverRadiusStandardMiles: row.driver_radius_standard_miles,
      driverRadiusExtendedMiles: row.driver_radius_extended_miles,
      driverRadiusUnlimitedMiles: row.driver_radius_unlimited_miles,
      customerOrderPlatformFeePercent: row.customer_order_platform_fee_percent,
      depotOrderPlatformFeePercent: row.depot_order_platform_fee_percent,
      customerOrderPlatformFeePerLitreCents:
        row.customer_order_platform_fee_per_litre_cents ?? DEFAULT_FEE_PER_LITRE_CENTS,
      depotOrderPlatformFeePerLitreCents:
        row.depot_order_platform_fee_per_litre_cents ?? DEFAULT_FEE_PER_LITRE_CENTS,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    } as any;
  }
}

function normalizeLitres(litres: number): number {
  const n = Number(litres);
  if (!Number.isFinite(n) || n < 0) {
    throw new Error("Litres must be a non-negative number");
  }
  return n;
}

function feePerLitreCents(raw: number | null | undefined): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return DEFAULT_FEE_PER_LITRE_CENTS;
  return Math.round(n);
}

/** Reads per-litre rates with R1/L fallback when columns are missing. */
export async function getPlatformFeePerLitreCents(): Promise<{
  customerOrderPlatformFeePerLitreCents: number;
  depotOrderPlatformFeePerLitreCents: number;
}> {
  try {
    const { pool } = await import("./db");
    const r = await pool.query(
      `SELECT
         COALESCE(customer_order_platform_fee_per_litre_cents, $1) AS customer_cents,
         COALESCE(depot_order_platform_fee_per_litre_cents, $1) AS depot_cents
       FROM app_settings WHERE id = 1`,
      [DEFAULT_FEE_PER_LITRE_CENTS],
    );
    if (r.rows[0]) {
      return {
        customerOrderPlatformFeePerLitreCents: feePerLitreCents(r.rows[0].customer_cents),
        depotOrderPlatformFeePerLitreCents: feePerLitreCents(r.rows[0].depot_cents),
      };
    }
  } catch (e: any) {
    if (!String(e?.message || e).includes("column")) throw e;
  }
  return {
    customerOrderPlatformFeePerLitreCents: DEFAULT_FEE_PER_LITRE_CENTS,
    depotOrderPlatformFeePerLitreCents: DEFAULT_FEE_PER_LITRE_CENTS,
  };
}

/** Customer order: platform fee = litres × customer_order_platform_fee_per_litre_cents (added on top). */
export async function calculateCustomerOrderSplit(
  fuelCents: number,
  deliveryCents: number,
  litres: number,
): Promise<SplitAmounts> {
  const rates = await getPlatformFeePerLitreCents();
  const litresNorm = normalizeLitres(litres);
  const rate = rates.customerOrderPlatformFeePerLitreCents;
  const subtotal = fuelCents + deliveryCents;
  const platformFeeCents = Math.round(litresNorm * rate);
  const grossCents = subtotal + platformFeeCents;
  return {
    grossCents,
    platformFeeCents,
    netPayoutCents: subtotal,
  };
}

/**
 * Depot order: driver pays listed depot total (gross); platform fee is deducted from supplier payout.
 * Fee = litres × depot_order_platform_fee_per_litre_cents.
 */
export async function calculateDepotOrderSplit(
  grossCents: number,
  litres: number,
): Promise<SplitAmounts> {
  const rates = await getPlatformFeePerLitreCents();
  const litresNorm = normalizeLitres(litres);
  const rate = rates.depotOrderPlatformFeePerLitreCents;
  const platformFeeCents = Math.round(litresNorm * rate);
  if (platformFeeCents > grossCents) {
    throw new Error(
      `Platform commission (R${(platformFeeCents / 100).toFixed(2)}) exceeds depot order total (R${(grossCents / 100).toFixed(2)})`,
    );
  }
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
