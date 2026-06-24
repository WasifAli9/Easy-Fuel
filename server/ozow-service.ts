/**
 * Ozow One API pay-in service.
 * @see https://hub.ozow.com/docs/one-api/yu4y4luah3arn-quickstart-payments
 */
import crypto from "crypto";
import { ozowPayinNotifyUrl, publicAppUrl } from "./payment-service";

const OZOW_SITE_CODE = process.env.OZOW_SITE_CODE || "";
const OZOW_CLIENT_ID = process.env.OZOW_CLIENT_ID || "";
const OZOW_CLIENT_SECRET = process.env.OZOW_CLIENT_SECRET || "";
const OZOW_ONE_API_BASE_URL = (
  process.env.OZOW_ONE_API_BASE_URL || "https://stagingone.ozow.com"
).replace(/\/$/, "");

let cachedToken: { token: string; expiresAt: number } | null = null;

export interface OzowPayInParams {
  amountRands: number;
  transactionReference: string;
  bankReference?: string;
  customerName?: string;
  customerEmail?: string;
  successUrl: string;
  cancelUrl: string;
  notifyUrl?: string;
}

export interface OzowPayInResult {
  paymentUrl: string;
  paymentId?: string;
  transactionReference: string;
}

export interface OzowWebhookPayload {
  TransactionReference: string;
  Status: string;
  Amount?: number;
  Currency?: string;
  TransactionId?: string;
  [key: string]: unknown;
}

export function isOzowConfigured(): boolean {
  try {
    return !!(
      OZOW_SITE_CODE &&
      OZOW_CLIENT_ID &&
      OZOW_CLIENT_SECRET &&
      publicAppUrl()
    );
  } catch {
    return false;
  }
}

function sha256Hex(input: string): string {
  return crypto.createHash("sha256").update(input, "utf8").digest("hex");
}

function oneApiBaseUrl(): string {
  return OZOW_ONE_API_BASE_URL;
}

function formatOzowApiError(context: string, status: number, rawText: string): string {
  if (status === 401 || status === 403) {
    return `${context}: Ozow rejected the credentials (HTTP ${status}). Check OZOW_CLIENT_ID, OZOW_CLIENT_SECRET, and OZOW_SITE_CODE in your .env file.`;
  }
  if (status >= 500) {
    return `${context}: Ozow staging returned HTTP ${status}. This usually means sandbox credentials are not active yet, or Ozow's staging service is down. Confirm settings with Ozow (Itu) or use OZOW_PAYIN_DRY_RUN=true for local testing.`;
  }
  let detail = rawText.slice(0, 200);
  try {
    const parsed = JSON.parse(rawText) as { title?: string; detail?: string; message?: string };
    detail = parsed.detail || parsed.message || parsed.title || detail;
  } catch {
    // keep raw snippet
  }
  return `${context}: ${detail}`;
}

/** OAuth 2.0 client credentials – One API quickstart. */
async function getOneApiAccessToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) {
    return cachedToken.token;
  }

  const body = new URLSearchParams({
    client_id: OZOW_CLIENT_ID,
    client_secret: OZOW_CLIENT_SECRET,
    scope: "payment",
    grant_type: "client_credentials",
  });

  const res = await fetch(`${oneApiBaseUrl()}/v1/token`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: body.toString(),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(formatOzowApiError("Ozow One API token request failed", res.status, text));
  }

  const data = (await res.json()) as {
    access_token?: string;
    expires_in?: number | string;
  };
  if (!data.access_token) {
    throw new Error("Ozow One API token response missing access_token");
  }

  const expiresIn = Number(data.expires_in ?? 3600);
  cachedToken = {
    token: data.access_token,
    expiresAt: Date.now() + expiresIn * 1000,
  };
  return data.access_token;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function pickString(obj: Record<string, unknown> | null, ...keys: string[]): string | undefined {
  if (!obj) return undefined;
  for (const key of keys) {
    const v = obj[key];
    if (v !== undefined && v !== null && String(v).trim() !== "") return String(v);
  }
  return undefined;
}

/** Resolve hosted checkout URL from One API create-payment response. */
function extractCheckoutUrl(
  data: Record<string, unknown>,
  paymentId?: string,
): string | undefined {
  const direct =
    pickString(data, "redirectUrl", "paymentUrl", "checkoutUrl", "completionUrl") ||
    pickString(asRecord(data.attributes), "redirectUrl", "paymentUrl", "checkoutUrl", "completionUrl");
  if (direct) return direct;

  const links = asRecord(data.links);
  if (links) {
    const fromLinks = pickString(links, "checkout", "redirect", "payment", "hosted");
    if (fromLinks) return fromLinks;
  }

  const id = paymentId || pickString(data, "id", "paymentId");
  if (id) {
    if (id.startsWith("http")) return id;
    return `${oneApiBaseUrl()}/checkout/${encodeURIComponent(id)}`;
  }

  return undefined;
}

async function createOneApiPayment(
  params: OzowPayInParams,
): Promise<{ paymentUrl: string; paymentId?: string }> {
  const token = await getOneApiAccessToken();
  const notifyUrl = params.notifyUrl || ozowPayinNotifyUrl();
  const isTest = process.env.OZOW_IS_TEST === "true";

  const payload: Record<string, unknown> = {
    siteCode: OZOW_SITE_CODE,
    countryCode: "ZA",
    currencyCode: "ZAR",
    amount: Number(params.amountRands.toFixed(2)),
    transactionReference: params.transactionReference.slice(0, 50),
    bankReference: (params.bankReference || params.transactionReference).slice(0, 20),
    notifyUrl,
    successUrl: params.successUrl,
    cancelUrl: params.cancelUrl,
    isTest,
  };
  if (params.customerName) payload.customer = params.customerName.slice(0, 100);
  if (params.customerEmail) payload.customerEmail = params.customerEmail.slice(0, 150);

  const res = await fetch(`${oneApiBaseUrl()}/v1/payments`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const rawText = await res.text();
  let data: Record<string, unknown> = {};
  try {
    const parsed = JSON.parse(rawText) as unknown;
    data = asRecord(parsed) ?? {};
    const nested = asRecord(data.data);
    if (nested) {
      data = { ...nested, ...asRecord(nested.attributes), links: data.links ?? nested.links };
    }
  } catch {
    throw new Error(`Ozow One API create payment returned non-JSON (${res.status}): ${rawText}`);
  }

  if (!res.ok) {
    const msg =
      pickString(data, "message", "title", "detail") ||
      pickString(asRecord(data.error), "message", "Message") ||
      rawText;
    throw new Error(`Ozow One API create payment failed (${res.status}): ${msg}`);
  }

  const paymentId = pickString(data, "id", "paymentId");
  const paymentUrl = extractCheckoutUrl(data, paymentId);
  if (!paymentUrl) {
    throw new Error(
      `Ozow One API create payment succeeded but no checkout URL was returned: ${rawText.slice(0, 500)}`,
    );
  }

  return { paymentUrl, paymentId };
}

/**
 * Create Ozow pay-in session and return redirect URL for web/mobile checkout.
 */
export async function createOzowPayIn(params: OzowPayInParams): Promise<OzowPayInResult> {
  if (!isOzowConfigured()) {
    throw new Error(
      "Ozow is not configured. Set OZOW_SITE_CODE, OZOW_CLIENT_ID, OZOW_CLIENT_SECRET, and PUBLIC_APP_URL.",
    );
  }

  if (process.env.OZOW_PAYIN_DRY_RUN === "true" && process.env.OZOW_IS_TEST === "true") {
    console.warn("[ozow] OZOW_PAYIN_DRY_RUN enabled – skipping live Ozow checkout");
    return {
      paymentUrl: params.successUrl,
      paymentId: `dry-run-${params.transactionReference}`,
      transactionReference: params.transactionReference,
    };
  }

  const result = await createOneApiPayment(params);
  return {
    paymentUrl: result.paymentUrl,
    paymentId: result.paymentId,
    transactionReference: params.transactionReference,
  };
}

/** Optional: verify pay-in status via One API (recommended anti-spoof check). */
export async function getOneApiPaymentById(paymentId: string): Promise<Record<string, unknown> | null> {
  if (!isOzowConfigured() || !paymentId) return null;
  try {
    const token = await getOneApiAccessToken();
    const res = await fetch(`${oneApiBaseUrl()}/v1/payments/${encodeURIComponent(paymentId)}`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
      },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as Record<string, unknown>;
    const nested = asRecord(data.data);
    return nested ? { ...nested, ...asRecord(nested.attributes) } : data;
  } catch {
    return null;
  }
}

export function defaultSuccessUrl(context: string, contextId: string): string {
  return `${publicAppUrl()}/payment/success?context=${encodeURIComponent(context)}&id=${encodeURIComponent(contextId)}`;
}

export function defaultCancelUrl(context: string, contextId: string): string {
  return `${publicAppUrl()}/payment/cancel?context=${encodeURIComponent(context)}&id=${encodeURIComponent(contextId)}`;
}

/**
 * Verify Ozow pay-in webhook notification hash.
 * One API notifications use the `Hash` field (legacy notifications may use `HashCheck`).
 */
export function verifyWebhookPayload(
  bodyOrQuery: Record<string, string | undefined>,
): { valid: boolean; payload: OzowWebhookPayload | null } {
  const hashReceived =
    bodyOrQuery.Hash || bodyOrQuery.hash || bodyOrQuery.HashCheck || bodyOrQuery.hashCheck || "";
  const transactionRef =
    bodyOrQuery.TransactionReference ||
    bodyOrQuery.transactionReference ||
    bodyOrQuery.TransactionId ||
    bodyOrQuery.transactionId ||
    "";
  const status = bodyOrQuery.Status || bodyOrQuery.status || "";

  if (!transactionRef || !status) {
    return { valid: false, payload: null };
  }

  let valid = true;
  if (hashReceived && OZOW_CLIENT_SECRET) {
    const copy = { ...bodyOrQuery };
    delete copy.Hash;
    delete copy.hash;
    delete copy.HashCheck;
    delete copy.hashCheck;
    const sortedKeys = Object.keys(copy)
      .filter((k) => copy[k] !== undefined && copy[k] !== "")
      .sort();
    const queryString = sortedKeys.map((k) => `${k}=${copy[k]}`).join("&");
    const expected = sha256Hex(queryString.toLowerCase() + OZOW_CLIENT_SECRET);
    valid = hashReceived === expected || hashReceived.toLowerCase() === expected.toLowerCase();
  }

  if (
    !valid &&
    process.env.OZOW_WEBHOOK_SKIP_VERIFY === "true" &&
    process.env.OZOW_IS_TEST === "true"
  ) {
    console.warn("[ozow] Webhook hash mismatch ignored (OZOW_WEBHOOK_SKIP_VERIFY staging mode)");
    valid = true;
  }

  const payload: OzowWebhookPayload = {
    TransactionReference: transactionRef,
    Status: status,
    TransactionId: bodyOrQuery.TransactionId || bodyOrQuery.transactionId,
    Amount: bodyOrQuery.Amount ? parseFloat(bodyOrQuery.Amount) : undefined,
    Currency: bodyOrQuery.CurrencyCode || bodyOrQuery.Currency,
    ...bodyOrQuery,
  };

  return { valid, payload: valid ? payload : null };
}
