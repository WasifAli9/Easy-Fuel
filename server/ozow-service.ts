/**
 * OZOW payment gateway service for driver subscription payments.
 * Builds redirect URL for Pay by Bank and verifies webhook callbacks.
 * See https://hub.ozow.com/ for exact API parameters and signature algorithm.
 */

import crypto from "crypto";

const OZOW_BASE_URL = process.env.OZOW_BASE_URL || "https://pay.ozow.com";
const OZOW_SITE_CODE = process.env.OZOW_SITE_CODE || "";
const OZOW_API_KEY = process.env.OZOW_API_KEY || "";
const OZOW_PRIVATE_KEY = process.env.OZOW_PRIVATE_KEY || "";

export interface OzowPaymentParams {
  /** Amount in ZAR (OZOW often expects rands, not cents – check docs) */
  amountRands: number;
  /** Unique transaction reference (e.g. sub_<subscriptionPaymentId>) */
  transactionReference: string;
  /** URL to redirect user after successful payment */
  successUrl: string;
  /** URL to redirect user after cancel/failure */
  cancelUrl: string;
  /** Server-to-server webhook URL for payment status */
  notificationUrl: string;
  /** Optional: customer name for prefill */
  customerName?: string;
  /** Optional: customer email */
  customerEmail?: string;
}

/**
 * Build the redirect URL for OZOW Pay by Bank.
 * Customer is sent to this URL to complete payment at their bank.
 * Signature algorithm may vary – OZOW Hub docs specify exact order and format.
 */
export function buildPaymentRedirectUrl(params: OzowPaymentParams): string {
  const {
    amountRands,
    transactionReference,
    successUrl,
    cancelUrl,
    notificationUrl,
    customerName = "",
    customerEmail = "",
  } = params;

  const countryCode = "ZA";
  const currencyCode = "ZAR";
  const isTest = process.env.OZOW_IS_TEST === "true";

  // Query params (order may matter for signature – adjust per OZOW docs)
  const query: Record<string, string> = {
    SiteCode: OZOW_SITE_CODE,
    CountryCode: countryCode,
    CurrencyCode: currencyCode,
    Amount: String(amountRands.toFixed(2)),
    TransactionReference: transactionReference,
    BankReference: transactionReference,
    SuccessUrl: successUrl,
    CancelUrl: cancelUrl,
    NotifyUrl: notificationUrl,
    Customer: customerName,
    CustomerEmail: customerEmail,
    IsTest: isTest ? "true" : "false",
  };

  // Remove empty optional fields
  Object.keys(query).forEach((k) => {
    if (query[k] === "") delete query[k];
  });

  const sortedKeys = Object.keys(query).sort();
  const queryString = sortedKeys.map((k) => `${k}=${encodeURIComponent(query[k])}`).join("&");
  const hash = computeOzowHash(queryString);
  const url = `${OZOW_BASE_URL}?${queryString}&HashCheck=${encodeURIComponent(hash)}`;
  return url;
}

/**
 * Compute HashCheck for OZOW.
 * Common pattern: lowercase concatenated values + private key, then SHA256 hex.
 * Verify against https://hub.ozow.com/ Pay-in API documentation.
 */
function computeOzowHash(queryString: string): string {
  if (!OZOW_PRIVATE_KEY) {
    console.warn("OZOW_PRIVATE_KEY not set – hash will be placeholder");
    return crypto.createHash("sha256").update(queryString + "").digest("hex");
  }
  const prehash = queryString.toLowerCase() + OZOW_PRIVATE_KEY;
  return crypto.createHash("sha256").update(prehash, "utf8").digest("hex");
}

/**
 * Verify webhook callback from OZOW.
 * OZOW may send GET with query params or POST with body; they often include a HashCheck or similar.
 * Returns parsed result or null if invalid.
 */
export interface OzowWebhookPayload {
  TransactionReference: string;
  Status: string; // e.g. Complete, Abandoned, Error
  Amount?: number;
  Currency?: string;
  [key: string]: unknown;
}

export function verifyWebhookPayload(
  bodyOrQuery: Record<string, string | undefined>
): { valid: boolean; payload: OzowWebhookPayload | null } {
  const hashReceived = bodyOrQuery.HashCheck || bodyOrQuery.hashCheck || "";
  const transactionRef = bodyOrQuery.TransactionReference || bodyOrQuery.TransactionId || "";
  const status = bodyOrQuery.Status || bodyOrQuery.status || "";

  if (!transactionRef || !status) {
    return { valid: false, payload: null };
  }

  // Recompute hash excluding HashCheck (order per OZOW docs)
  const copy = { ...bodyOrQuery };
  delete copy.HashCheck;
  delete copy.hashCheck;
  const sortedKeys = Object.keys(copy).filter((k) => copy[k] !== undefined && copy[k] !== "").sort();
  const queryString = sortedKeys.map((k) => `${k}=${copy[k]}`).join("&");
  const expectedHash = computeOzowHash(queryString);

  const valid = !OZOW_PRIVATE_KEY || hashReceived === expectedHash;
  const payload: OzowWebhookPayload = {
    TransactionReference: transactionRef,
    Status: status,
    Amount: bodyOrQuery.Amount ? parseFloat(bodyOrQuery.Amount) : undefined,
    Currency: bodyOrQuery.CurrencyCode || bodyOrQuery.Currency,
    ...bodyOrQuery,
  };

  return { valid, payload: valid ? payload : null };
}

/**
 * Check if OZOW is configured (so we can show "Subscribe" vs "Payment unavailable").
 */
export function isOzowConfigured(): boolean {
  return !!(OZOW_SITE_CODE && OZOW_PRIVATE_KEY);
}
