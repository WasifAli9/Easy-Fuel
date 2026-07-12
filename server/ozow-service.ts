/**
 * Ozow One API pay-in service.
 * @see https://hub.ozow.com/docs/one-api/yu4y4luah3arn-quickstart-payments
 */
import crypto from "crypto";
import { ozowPayinNotifyUrl, publicAppUrl } from "./payment-service";

const OZOW_SITE_CODE = process.env.OZOW_SITE_CODE || "";
const OZOW_CLIENT_ID = process.env.OZOW_CLIENT_ID || "";
const OZOW_CLIENT_SECRET = process.env.OZOW_CLIENT_SECRET || "";
/** Merchant Private Key from Ozow dashboard – used for pay-in webhook Hash (SHA512). */
const OZOW_PRIVATE_KEY = (
  process.env.OZOW_PRIVATE_KEY ||
  process.env.OZOW_API_PRIVATE_KEY ||
  ""
).trim();
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

function sha512Hex(input: string): string {
  return crypto.createHash("sha512").update(input, "utf8").digest("hex");
}

function pickField(
  body: Record<string, string | undefined>,
  ...keys: string[]
): string {
  for (const k of keys) {
    const v = body[k];
    if (v !== undefined && v !== null && String(v) !== "") return String(v);
  }
  return "";
}

function oneApiBaseUrl(): string {
  return OZOW_ONE_API_BASE_URL;
}

/** Truthy env flags: true / 1 / yes (trim + ignore quotes / CRLF). */
export function envFlagEnabled(name: string): boolean {
  const raw = process.env[name];
  if (raw == null) return false;
  const v = String(raw).trim().replace(/^["']|["']$/g, "").toLowerCase();
  return v === "true" || v === "1" || v === "yes";
}

export function isOzowPayinDryRun(): boolean {
  // Dry-run is controlled only by OZOW_PAYIN_DRY_RUN (does not also require OZOW_IS_TEST).
  return envFlagEnabled("OZOW_PAYIN_DRY_RUN");
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
    // Ozow confirmed scope must be "payments" (docs incorrectly say "payment")
    scope: "payments",
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
  const isTest = envFlagEnabled("OZOW_IS_TEST");

  const merchantReference = params.transactionReference.slice(0, 50);
  const expireAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  const bankReference = (params.bankReference || merchantReference)
    .replace(/[^a-zA-Z0-9]/g, "")
    .slice(0, 20);

  /**
   * Staging One API accepts a flat JSON body (not JSON:API).
   * Required: siteCode, amount{currency,value}, merchantReference, expireAt, region.
   * Confirmed working against https://stagingone.ozow.com/v1/payments (HTTP 201).
   */
  const payload: Record<string, unknown> = {
    siteCode: OZOW_SITE_CODE,
    region: "ZA",
    countryCode: "ZA",
    currencyCode: "ZAR",
    amount: {
      currency: "ZAR",
      value: Number(params.amountRands.toFixed(2)),
    },
    merchantReference,
    transactionReference: merchantReference,
    bankReference,
    expireAt,
    notifyUrl,
    successUrl: params.successUrl,
    cancelUrl: params.cancelUrl,
    errorUrl: params.cancelUrl,
    isTest,
  };
  if (params.customerName) payload.customer = params.customerName.slice(0, 100);
  if (params.customerEmail) payload.customerEmail = params.customerEmail.slice(0, 150);

  if (isTest) {
    console.info("[ozow] create payment request:", JSON.stringify(payload));
  }

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
    throw new Error(
      `Ozow One API create payment returned non-JSON (${res.status}): ${rawText.slice(0, 300)}`,
    );
  }

  if (!res.ok) {
    console.error("[ozow] create payment validation/error body:", rawText.slice(0, 2000));
    const topErrors = Array.isArray(data.errors) ? data.errors : null;
    let detailMsg =
      pickString(data, "message", "title", "detail") ||
      pickString(asRecord(data.error), "message", "Message") ||
      "";
    if (!detailMsg && topErrors && topErrors.length > 0) {
      detailMsg = topErrors
        .map((e) => {
          const er = asRecord(e) || {};
          const pointer = pickString(asRecord(er.source), "pointer");
          const detail = pickString(er, "detail", "title", "message");
          if (pointer && detail) return `${pointer}: ${detail}`;
          return detail || pointer || JSON.stringify(e);
        })
        .join("; ");
    }
    throw new Error(
      `Ozow One API create payment failed (${res.status}): ${detailMsg || rawText.slice(0, 500)}`,
    );
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

  if (isOzowPayinDryRun()) {
    console.warn(
      `[ozow] OZOW_PAYIN_DRY_RUN enabled – skipping live Ozow checkout` +
        ` (OZOW_IS_TEST=${JSON.stringify(process.env.OZOW_IS_TEST)})`,
    );
    return {
      paymentUrl: params.successUrl,
      paymentId: `dry-run-${params.transactionReference}`,
      transactionReference: params.transactionReference,
    };
  }

  console.warn(
    `[ozow] live pay-in: dryRun=${JSON.stringify(process.env.OZOW_PAYIN_DRY_RUN)}` +
      ` isTest=${JSON.stringify(process.env.OZOW_IS_TEST)}` +
      ` siteCode=${OZOW_SITE_CODE ? "set" : "missing"}`,
  );

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
 * Verify Ozow pay-in webhook / redirect Hash.
 * Ozow: SHA512(lowercase(SiteCode + TransactionId + TransactionReference + Amount + Status
 *   + [Optional1..5] + CurrencyCode + IsTest + [StatusMessage] + PrivateKey))
 * Confirmed against staging responsetest.php Hash String.
 * @see https://ozow.com/integrations (transaction notification hash)
 */
export function verifyWebhookPayload(
  bodyOrQuery: Record<string, string | undefined>,
): { valid: boolean; payload: OzowWebhookPayload | null } {
  const hashReceived = pickField(
    bodyOrQuery,
    "Hash",
    "hash",
    "HashCheck",
    "hashCheck",
  );
  const siteCode = pickField(bodyOrQuery, "SiteCode", "siteCode") || OZOW_SITE_CODE;
  const transactionId = pickField(
    bodyOrQuery,
    "TransactionId",
    "transactionId",
  );
  const transactionRef = pickField(
    bodyOrQuery,
    "TransactionReference",
    "transactionReference",
  );
  const amount = pickField(bodyOrQuery, "Amount", "amount");
  const status = pickField(bodyOrQuery, "Status", "status");
  const currencyCode = pickField(
    bodyOrQuery,
    "CurrencyCode",
    "currencyCode",
    "Currency",
  );
  const isTest = pickField(bodyOrQuery, "IsTest", "isTest");
  const statusMessage = pickField(
    bodyOrQuery,
    "StatusMessage",
    "statusMessage",
  );
  const optional1 = pickField(bodyOrQuery, "Optional1", "optional1");
  const optional2 = pickField(bodyOrQuery, "Optional2", "optional2");
  const optional3 = pickField(bodyOrQuery, "Optional3", "optional3");
  const optional4 = pickField(bodyOrQuery, "Optional4", "optional4");
  const optional5 = pickField(bodyOrQuery, "Optional5", "optional5");

  if (!transactionRef || !status) {
    return { valid: false, payload: null };
  }

  let valid = !hashReceived; // no hash provided → accept (rare)
  const privateKey = OZOW_PRIVATE_KEY;

  if (hashReceived && privateKey) {
    // Match Ozow responsetest "Hash String" (empty optionals / StatusMessage omitted).
    const candidates = [
      [
        siteCode,
        transactionId,
        transactionRef,
        amount,
        status,
        currencyCode,
        isTest,
        privateKey,
      ].join(""),
      // Full docs order with empty optionals included as "".
      [
        siteCode,
        transactionId,
        transactionRef,
        amount,
        status,
        optional1,
        optional2,
        optional3,
        optional4,
        optional5,
        currencyCode,
        isTest,
        statusMessage,
        privateKey,
      ].join(""),
      // Minimal redirect hash (some success redirects omit currency/isTest).
      [siteCode, transactionId, transactionRef, amount, status, privateKey].join(""),
    ];

    const received = hashReceived.toLowerCase();
    valid = candidates.some((raw) => {
      const expected = sha512Hex(raw.toLowerCase());
      return expected === received;
    });

    if (!valid) {
      console.warn("[ozow] pay-in webhook hash mismatch", {
        siteCode,
        transactionRef,
        status,
        amount,
        hasPrivateKey: true,
      });
    }
  } else if (hashReceived && !privateKey) {
    console.error(
      "[ozow] OZOW_PRIVATE_KEY is not set – cannot verify pay-in webhook Hash. " +
        "Set Merchant Details → Private Key in .env",
    );
    valid = false;
  }

  // Legacy fallback (incorrect for Ozow notify) kept only if private key path failed
  // and old env accidentally relied on client secret — do not prefer this.
  if (!valid && hashReceived && OZOW_CLIENT_SECRET && !privateKey) {
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
    valid = hashReceived.toLowerCase() === expected.toLowerCase();
  }

  if (
    !valid &&
    envFlagEnabled("OZOW_WEBHOOK_SKIP_VERIFY") &&
    envFlagEnabled("OZOW_IS_TEST")
  ) {
    console.warn("[ozow] Webhook hash mismatch ignored (OZOW_WEBHOOK_SKIP_VERIFY staging mode)");
    valid = true;
  }

  const payload: OzowWebhookPayload = {
    TransactionReference: transactionRef,
    Status: status,
    TransactionId: transactionId || undefined,
    Amount: amount ? parseFloat(amount) : undefined,
    Currency: currencyCode || undefined,
    ...bodyOrQuery,
  };

  return { valid, payload: valid ? payload : null };
}
