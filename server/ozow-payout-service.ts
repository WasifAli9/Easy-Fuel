/**
 * Ozow Payouts API – disburse net amounts to driver/supplier bank accounts.
 * @see https://hub.ozow.com/docs/payouts-api/p91zsgmrgnnm2-payouts-integration
 * @see https://hub.ozow.com/docs/payouts-api/mb5i2zhpu9obb-step-1-get-available-banks
 */
import crypto from "crypto";
import { eq } from "drizzle-orm";
import { db } from "./db";
import { payoutTransactions, paymentTransactions } from "@shared/schema";
import type { BankDetails } from "./payment-service";
import { publicAppUrl } from "./payment-service";
import { envFlagEnabled } from "./ozow-service";

const OZOW_SITE_CODE = process.env.OZOW_SITE_CODE || "";
const OZOW_PAYOUT_API_BASE = (
  process.env.OZOW_PAYOUT_API_BASE_URL || "https://stagingpayoutsapi.ozow.com"
).replace(/\/$/, "");
const OZOW_PAYOUT_SUBMIT_PATH =
  process.env.OZOW_PAYOUT_SUBMIT_PATH || "/v1/requestpayout";
/** Prefer dedicated payout key; do not silently use One API client secret. */
const OZOW_PAYOUT_API_KEY =
  process.env.OZOW_PAYOUT_API_KEY || process.env.OZOW_API_KEY || "";
const OZOW_PAYOUT_ACCESS_TOKEN = process.env.OZOW_PAYOUT_ACCESS_TOKEN || "";

export type OzowBankGroup = {
  bankGroupId: string;
  bankGroupName: string;
  universalBranchCode: string;
};

let banksCache: { fetchedAt: number; banks: OzowBankGroup[] } | null = null;
const BANKS_CACHE_MS = 60 * 60 * 1000;

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

function payoutHeaders(): Record<string, string> {
  return {
    Accept: "application/json",
    "Content-Type": "application/json",
    ApiKey: OZOW_PAYOUT_API_KEY,
    SiteCode: OZOW_SITE_CODE,
  };
}

function normalizeBankName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")
    .replace(/bank(limited|ltd)?$/g, "")
    .replace(/limited|ltd/g, "");
}

/** Common SA bank aliases → tokens that appear in Ozow bankGroupName. */
const BANK_ALIASES: Record<string, string[]> = {
  absa: ["absa"],
  fnb: ["fnb", "firstnational"],
  firstnational: ["fnb", "firstnational"],
  standard: ["standard"],
  standardbank: ["standard"],
  nedbank: ["nedbank"],
  capitec: ["capitec"],
  investec: ["investec"],
  discovery: ["discovery"],
  tyme: ["tyme"],
  tymbank: ["tyme"],
  africanbank: ["african"],
  bidvest: ["bidvest"],
};

export function matchBankGroup(
  bankName: string,
  banks: OzowBankGroup[],
): OzowBankGroup | null {
  const needle = normalizeBankName(bankName);
  if (!needle || banks.length === 0) return null;

  const exact = banks.find((b) => normalizeBankName(b.bankGroupName) === needle);
  if (exact) return exact;

  const aliases = BANK_ALIASES[needle] || [needle];
  for (const alias of aliases) {
    const hit = banks.find((b) => normalizeBankName(b.bankGroupName).includes(alias));
    if (hit) return hit;
  }

  return banks.find((b) => {
    const n = normalizeBankName(b.bankGroupName);
    return n.includes(needle) || needle.includes(n);
  }) || null;
}

/**
 * Fetch Ozow available banks (cached 1h).
 * @see https://hub.ozow.com/docs/payouts-api/mb5i2zhpu9obb-step-1-get-available-banks
 */
export async function getAvailableBanks(forceRefresh = false): Promise<OzowBankGroup[]> {
  if (!isOzowPayoutConfigured()) {
    throw new Error("Ozow payouts not configured. Set OZOW_PAYOUT_API_KEY and OZOW_SITE_CODE.");
  }

  if (!forceRefresh && banksCache && Date.now() - banksCache.fetchedAt < BANKS_CACHE_MS) {
    return banksCache.banks;
  }

  const res = await fetch(`${OZOW_PAYOUT_API_BASE}/v1/getavailablebanks`, {
    method: "GET",
    headers: payoutHeaders(),
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Ozow getavailablebanks failed (${res.status}): ${text.slice(0, 300)}`);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("Ozow getavailablebanks returned invalid JSON");
  }

  const list = Array.isArray(parsed)
    ? parsed
    : Array.isArray((parsed as { data?: unknown })?.data)
      ? (parsed as { data: unknown[] }).data
      : Array.isArray((parsed as { resultObject?: unknown })?.resultObject)
        ? (parsed as { resultObject: unknown[] }).resultObject
        : [];

  const banks: OzowBankGroup[] = list
    .map((row) => {
      const r = row as Record<string, unknown>;
      return {
        bankGroupId: String(r.bankGroupId || r.BankGroupId || ""),
        bankGroupName: String(r.bankGroupName || r.BankGroupName || ""),
        universalBranchCode: String(r.universalBranchCode || r.UniversalBranchCode || ""),
      };
    })
    .filter((b) => b.bankGroupId && b.bankGroupName);

  banksCache = { fetchedAt: Date.now(), banks };
  return banks;
}

export async function resolveBankGroupId(bankName: string): Promise<OzowBankGroup> {
  const banks = await getAvailableBanks();
  const match = matchBankGroup(bankName, banks);
  if (!match) {
    throw new Error(
      `No Ozow bankGroupId for bank "${bankName}". Update KYC bank name or refresh available banks.`,
    );
  }
  return match;
}

/**
 * Ozow payout request hashCheck — matches Hub Step 2 “Payout request hash calculation”.
 * @see https://hub.ozow.com/docs/payouts-api/te1u21qvzznh8-step-2-submit-payout-request#payout-request-hash-calculation
 *
 * Steps (Ozow docs):
 * 1. Concatenate post variables (excluding hashCheck) in table order
 * 2. Append ApiKey (Payout API Key — not Private Key)
 * 3. Convert concatenated string to lowercase
 * 4. SHA512 hash → hex
 *
 * Concat order (from Ozow C# example):
 * siteCode + amountInCents + merchantReference + customerBankReference + isRtc
 * + notifyUrl + bankGroupId + accountNumber + branchCode + apiKey
 *
 * Notes:
 * - amountInCents = Convert.ToInt32(amount * 100)  e.g. R17.15 → 1715
 * - isRtc becomes "true"/"false" after lowercase (C# bool.ToString then ToLower)
 * - accountNumber in the hash is the AES-encrypted hex value sent in the request
 */
export function buildPayoutHashCheck(params: {
  siteCode: string;
  /** Amount in rands (e.g. 17.15). Converted to integer cents for the hash. */
  amountRands: number;
  /** Prefer passing exact cents to avoid float drift; used when set. */
  amountCents?: number;
  merchantReference: string;
  customerBankReference: string;
  isRtc: boolean;
  notifyUrl: string;
  bankGroupId: string;
  /** Encrypted account number hex (same value as in bankingDetails.accountNumber). */
  accountNumber: string;
  branchCode: string;
  apiKey: string;
}): string {
  const amountCents =
    params.amountCents != null
      ? Math.trunc(params.amountCents)
      : Math.trunc(Math.round(params.amountRands * 100));
  // Match C#: bool.ToString() → "True"/"False", then entire string ToLowerInvariant
  const isRtcPart = params.isRtc ? "True" : "False";
  const input =
    params.siteCode +
    String(amountCents) +
    params.merchantReference +
    params.customerBankReference +
    isRtcPart +
    params.notifyUrl +
    params.bankGroupId +
    params.accountNumber +
    params.branchCode +
    params.apiKey;
  const lower = input.toLowerCase();
  return crypto.createHash("sha512").update(lower, "utf8").digest("hex");
}

/**
 * Encrypt destination account number (AES-256-CBC, PKCS7) per Ozow payout docs.
 * @see https://hub.ozow.com/docs/payouts-api/te1u21qvzznh8-step-2-submit-payout-request
 *
 * - Key size: 256 bits
 * - Mode: CBC
 * - Padding: PKCS7
 * - IV = first 16 bytes of SHA512(merchantReference + amountInCents + encryptionKey)
 * Merchant must persist encryptionKey and return it on verification as AccountNumberDecryptionKey.
 */
export function encryptPayoutAccountNumber(params: {
  accountNumber: string;
  merchantReference: string;
  amountCents: number;
  encryptionKeyHex: string;
}): string {
  const key = Buffer.from(params.encryptionKeyHex, "hex");
  if (key.length !== 32) {
    throw new Error("Payout encryption key must be 32 bytes (64 hex chars)");
  }
  const ivSource = crypto
    .createHash("sha512")
    .update(`${params.merchantReference}${params.amountCents}${params.encryptionKeyHex}`, "utf8")
    .digest();
  const iv = ivSource.subarray(0, 16);
  const cipher = crypto.createCipheriv("aes-256-cbc", key, iv);
  const encrypted = Buffer.concat([
    cipher.update(params.accountNumber, "utf8"),
    cipher.final(),
  ]);
  return encrypted.toString("hex");
}

function newPayoutEncryptionKeyHex(): string {
  return crypto.randomBytes(32).toString("hex");
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
 * Submit payout to Ozow. Dry-run records locally without calling Ozow.
 */
export async function submitOzowPayout(params: CreatePayoutParams): Promise<string> {
  const amountRands = Number((params.amountCents / 100).toFixed(2));
  const merchantReference = params.reference.slice(0, 50);
  const customerBankReference = merchantReference.slice(0, 20);

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

  if (envFlagEnabled("OZOW_PAYOUT_DRY_RUN")) {
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
    console.warn(
      "[ozow-payout] Not configured – set OZOW_PAYOUT_API_KEY (Payout API Key from Ozow dashboard)",
    );
    await db
      .update(payoutTransactions)
      .set({
        status: "failed",
        raw: { error: "OZOW_PAYOUT_API_KEY missing" } as Record<string, unknown>,
        updatedAt: new Date(),
      })
      .where(eq(payoutTransactions.id, payoutRow.id));
    return payoutRow.id;
  }

  try {
    const bankGroup = await resolveBankGroupId(params.bank.bankName);
    const branchCode =
      (params.bank.branchCode || bankGroup.universalBranchCode || "").replace(/\D/g, "").slice(0, 10);
    const notifyUrl = payoutNotificationUrl();
    const isRtc = false;

    const encryptionKeyHex = newPayoutEncryptionKeyHex();
    const encryptedAccount = encryptPayoutAccountNumber({
      accountNumber: params.bank.accountNumber.replace(/\s+/g, ""),
      merchantReference,
      amountCents: params.amountCents,
      encryptionKeyHex,
    });

    const hashCheck = buildPayoutHashCheck({
      siteCode: OZOW_SITE_CODE,
      amountRands,
      amountCents: params.amountCents,
      merchantReference,
      customerBankReference,
      isRtc,
      notifyUrl,
      bankGroupId: bankGroup.bankGroupId,
      accountNumber: encryptedAccount,
      branchCode,
      apiKey: OZOW_PAYOUT_API_KEY,
    });

    if (envFlagEnabled("OZOW_IS_TEST")) {
      console.info("[ozow-payout] hashCheck built", {
        siteCode: OZOW_SITE_CODE,
        amountCents: params.amountCents,
        merchantReference,
        customerBankReference,
        isRtc,
        notifyUrl,
        bankGroupId: bankGroup.bankGroupId,
        branchCode,
        accountNumberLen: encryptedAccount.length,
        hashCheckPrefix: hashCheck.slice(0, 16),
      });
    }

    const body = {
      siteCode: OZOW_SITE_CODE,
      amount: amountRands,
      merchantReference,
      customerBankReference,
      isRtc,
      notifyUrl,
      bankingDetails: {
        bankGroupId: bankGroup.bankGroupId,
        accountNumber: encryptedAccount,
        branchCode,
      },
      hashCheck,
    };

    const res = await fetch(`${OZOW_PAYOUT_API_BASE}${OZOW_PAYOUT_SUBMIT_PATH}`, {
      method: "POST",
      headers: payoutHeaders(),
      body: JSON.stringify(body),
    });

    const raw = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    const ozowPayoutId =
      String(raw.payoutId || raw.id || raw.PayoutId || raw.Id || "") || null;

    if (!res.ok) {
      console.error("[ozow-payout] API error:", raw);
      await db
        .update(payoutTransactions)
        .set({
          status: "failed",
          ozowPayoutId,
          raw: {
            ...raw,
            request: { ...body, bankingDetails: { ...body.bankingDetails, accountNumber: "[encrypted]" } },
            accountNumberDecryptionKey: encryptionKeyHex,
            bankGroupId: bankGroup.bankGroupId,
            bankGroupName: bankGroup.bankGroupName,
          },
          updatedAt: new Date(),
        })
        .where(eq(payoutTransactions.id, payoutRow.id));
      return payoutRow.id;
    }

    await db
      .update(payoutTransactions)
      .set({
        status: "submitted",
        ozowPayoutId: ozowPayoutId || payoutRow.id,
        raw: {
          ...raw,
          accountNumberDecryptionKey: encryptionKeyHex,
          bankGroupId: bankGroup.bankGroupId,
          bankGroupName: bankGroup.bankGroupName,
          merchantReference,
        },
        updatedAt: new Date(),
      })
      .where(eq(payoutTransactions.id, payoutRow.id));

    return payoutRow.id;
  } catch (e) {
    console.error("[ozow-payout] submit failed:", e);
    await db
      .update(payoutTransactions)
      .set({
        status: "failed",
        raw: {
          error: e instanceof Error ? e.message : String(e),
        } as Record<string, unknown>,
        updatedAt: new Date(),
      })
      .where(eq(payoutTransactions.id, payoutRow.id));
    return payoutRow.id;
  }
}

/** GET Ozow payout status by Ozow payout id. */
export async function fetchOzowPayoutStatus(ozowPayoutId: string): Promise<Record<string, unknown> | null> {
  if (!isOzowPayoutConfigured() || !ozowPayoutId) return null;
  const res = await fetch(
    `${OZOW_PAYOUT_API_BASE}/v1/getpayout?payoutId=${encodeURIComponent(ozowPayoutId)}`,
    { method: "GET", headers: payoutHeaders() },
  );
  if (!res.ok) {
    console.error("[ozow-payout] getpayout failed:", res.status, await res.text());
    return null;
  }
  return (await res.json()) as Record<string, unknown>;
}

export async function markPayoutCompleted(
  ozowPayoutId: string,
  raw?: Record<string, unknown>,
): Promise<void> {
  const payout = await findPayoutRow(ozowPayoutId);
  if (!payout) return;

  await db
    .update(payoutTransactions)
    .set({
      status: "completed",
      paidAt: new Date(),
      raw: raw ? { ...(payout.raw as object), ...raw } : payout.raw,
      updatedAt: new Date(),
    })
    .where(eq(payoutTransactions.id, payout.id));
}

export async function markPayoutFailed(
  ozowPayoutId: string,
  raw?: Record<string, unknown>,
): Promise<void> {
  const payout = await findPayoutRow(ozowPayoutId);
  if (!payout) return;

  await db
    .update(payoutTransactions)
    .set({
      status: "failed",
      raw: raw ? { ...(payout.raw as object), ...raw } : payout.raw,
      updatedAt: new Date(),
    })
    .where(eq(payoutTransactions.id, payout.id));
}

export async function markPayoutCancelled(
  ozowPayoutId: string,
  raw?: Record<string, unknown>,
): Promise<void> {
  const payout = await findPayoutRow(ozowPayoutId);
  if (!payout) return;

  await db
    .update(payoutTransactions)
    .set({
      status: "cancelled",
      raw: raw ? { ...(payout.raw as object), ...raw } : payout.raw,
      updatedAt: new Date(),
    })
    .where(eq(payoutTransactions.id, payout.id));
}

async function findPayoutRow(ozowPayoutId: string) {
  const byOzow = await db
    .select()
    .from(payoutTransactions)
    .where(eq(payoutTransactions.ozowPayoutId, ozowPayoutId))
    .limit(1);
  if (byOzow[0]) return byOzow[0];

  const byId = await db
    .select()
    .from(payoutTransactions)
    .where(eq(payoutTransactions.id, ozowPayoutId))
    .limit(1);
  return byId[0] ?? null;
}

export async function verifyPayoutRequest(payload: Record<string, unknown>): Promise<boolean> {
  const token =
    payload.accessToken ||
    payload.AccessToken ||
    payload.token ||
    payload.Token;
  if (!OZOW_PAYOUT_ACCESS_TOKEN) return true;
  return String(token) === OZOW_PAYOUT_ACCESS_TOKEN;
}

/** Decryption key stored when payout was submitted (for Ozow verification webhook). */
export function getStoredAccountDecryptionKey(
  payout: { raw?: unknown } | null | undefined,
): string | null {
  const raw = payout?.raw as Record<string, unknown> | null | undefined;
  const key = raw?.accountNumberDecryptionKey;
  return key ? String(key) : null;
}

export async function getPayoutById(payoutId: string) {
  return findPayoutRow(payoutId);
}

export async function getPayoutByMerchantReference(reference: string) {
  const rows = await db.select().from(payoutTransactions).limit(200);
  return (
    rows.find((p) => {
      const raw = p.raw as Record<string, unknown> | null;
      return (
        raw?.merchantReference === reference ||
        (typeof raw?.request === "object" &&
          raw.request &&
          (raw.request as Record<string, unknown>).merchantReference === reference)
      );
    }) ?? null
  );
}

export async function getPaymentTransaction(id: string) {
  const rows = await db
    .select()
    .from(paymentTransactions)
    .where(eq(paymentTransactions.id, id))
    .limit(1);
  return rows[0] ?? null;
}
