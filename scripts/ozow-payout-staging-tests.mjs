/**
 * Ozow official API + mock payout tests (staging).
 * Reads keys from project .env — never prints secrets.
 */
import crypto from "crypto";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const envPath = path.join(root, ".env");
for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
  const t = line.trim();
  if (!t || t.startsWith("#")) continue;
  const i = t.indexOf("=");
  if (i < 1) continue;
  const k = t.slice(0, i).trim();
  let v = t.slice(i + 1).trim();
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
    v = v.slice(1, -1);
  }
  if (process.env[k] == null) process.env[k] = v;
}

const SITE = (process.env.OZOW_SITE_CODE || "").trim();
const API_KEY = (process.env.OZOW_PAYOUT_API_KEY || process.env.OZOW_API_KEY || "").trim();
const BASE = (process.env.OZOW_PAYOUT_API_BASE_URL || "https://stagingpayoutsapi.ozow.com").replace(
  /\/$/,
  "",
);
const NOTIFY =
  process.env.OZOW_PAYOUT_NOTIFICATION_URL ||
  "https://portal.easyfuel.ai/api/webhooks/ozow-payout-notification";
const PUBLIC = (process.env.PUBLIC_APP_URL || "https://portal.easyfuel.ai").replace(/\/$/, "");

if (!SITE || !API_KEY) {
  console.error("Missing OZOW_SITE_CODE or OZOW_PAYOUT_API_KEY in .env");
  process.exit(1);
}

const headers = {
  Accept: "application/json",
  "Content-Type": "application/json",
  ApiKey: API_KEY,
  SiteCode: SITE,
};

function redact(obj) {
  const s = JSON.stringify(obj, null, 2);
  return s
    .replaceAll(API_KEY, "[REDACTED_API_KEY]")
    .replace(/accountNumberDecryptionKey":\s*"[^"]+"/gi, 'accountNumberDecryptionKey":"[REDACTED]"');
}

function hashCheck(p) {
  const cents = Math.trunc(p.amountCents);
  const isRtcPart = p.isRtc ? "True" : "False";
  const input =
    p.siteCode +
    String(cents) +
    p.merchantReference +
    p.customerBankReference +
    isRtcPart +
    p.notifyUrl +
    p.bankGroupId +
    p.accountNumber +
    p.branchCode +
    p.apiKey;
  return crypto.createHash("sha512").update(input.toLowerCase(), "utf8").digest("hex");
}

function encryptAccount({ accountNumber, merchantReference, amountCents, encryptionKeyHex }) {
  const key = Buffer.from(encryptionKeyHex, "hex");
  const ivSource = crypto
    .createHash("sha512")
    .update(`${merchantReference}${amountCents}${encryptionKeyHex}`, "utf8")
    .digest();
  const iv = ivSource.subarray(0, 16);
  const cipher = crypto.createCipheriv("aes-256-cbc", key, iv);
  return Buffer.concat([cipher.update(accountNumber, "utf8"), cipher.final()]).toString("hex");
}

async function requestPayout({ amountRands, merchantReference, accountNumber, bankGroupId, branchCode }) {
  const amountCents = Math.round(amountRands * 100);
  const customerBankReference = merchantReference.replace(/[^a-zA-Z0-9]/g, "").slice(0, 20);
  const encryptionKeyHex = crypto.randomBytes(32).toString("hex");
  const encrypted = encryptAccount({
    accountNumber: String(accountNumber).replace(/\s+/g, ""),
    merchantReference,
    amountCents,
    encryptionKeyHex,
  });
  const body = {
    siteCode: SITE,
    amount: amountRands,
    merchantReference,
    customerBankReference,
    isRtc: false,
    notifyUrl: NOTIFY.startsWith("http") ? NOTIFY : `${PUBLIC}/api/webhooks/ozow-payout-notification`,
    bankingDetails: {
      bankGroupId,
      accountNumber: encrypted,
      branchCode,
    },
    hashCheck: hashCheck({
      siteCode: SITE,
      amountCents,
      merchantReference,
      customerBankReference,
      isRtc: false,
      notifyUrl: NOTIFY.startsWith("http") ? NOTIFY : `${PUBLIC}/api/webhooks/ozow-payout-notification`,
      bankGroupId,
      accountNumber: encrypted,
      branchCode,
      apiKey: API_KEY,
    }),
  };
  const res = await fetch(`${BASE}/v1/requestpayout`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  const rawText = await res.text();
  let json = null;
  try {
    json = JSON.parse(rawText);
  } catch {
    json = { nonJson: rawText.slice(0, 800) };
  }
  return { status: res.status, json, encryptionKeyHex };
}

async function mockGetConfig() {
  const res = await fetch(
    `${BASE}/mock/v1/gettestconfiguration?siteCode=${encodeURIComponent(SITE)}`,
    { headers },
  );
  return { status: res.status, json: await res.json().catch(() => ({})) };
}

async function mockSetConfig(flags) {
  const body = {
    siteCode: SITE,
    IsAccountDecryptionFailed: false,
    IsNotVerifiedResponse: false,
    IsAccountDecryptionKeyMissing: false,
    ...flags,
  };
  const res = await fetch(`${BASE}/mock/v1/settestconfiguration`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  return { status: res.status, json: await res.json().catch(() => ({})) };
}

console.log("Ozow payout staging tests");
console.log("Base:", BASE);
console.log("Site code set:", Boolean(SITE), "ApiKey set:", Boolean(API_KEY));
console.log("Notify:", NOTIFY.startsWith("http") ? NOTIFY : `${PUBLIC}/api/webhooks/ozow-payout-notification`);
console.log("");

const banksRes = await fetch(`${BASE}/v1/getavailablebanks`, { headers });
const banksJson = await banksRes.json().catch(() => []);
const list = Array.isArray(banksJson)
  ? banksJson
  : banksJson.data || banksJson.resultObject || [];
const bank =
  list.find((b) => /fnb|first.?national|standard|absa|capitec|nedbank/i.test(String(b.bankGroupName || b.BankGroupName || ""))) ||
  list[0];
if (!bank) {
  console.error("getavailablebanks failed", banksRes.status, redact(banksJson));
  process.exit(1);
}
const bankGroupId = String(bank.bankGroupId || bank.BankGroupId);
const branchCode = String(bank.universalBranchCode || bank.UniversalBranchCode || "250655").replace(/\D/g, "").slice(0, 10);
console.log("Bank used:", bank.bankGroupName || bank.BankGroupName, "branch", branchCode);

const results = [];

async function run(id, title, fn) {
  console.log("\n====", id, title, "====");
  try {
    const out = await fn();
    console.log(redact(out));
    results.push({ id, title, ok: true, out });
  } catch (e) {
    console.error(String(e));
    results.push({ id, title, ok: false, error: String(e) });
  }
}

await run("API-1", "Payout below R1 (0.50)", async () => {
  const r = await requestPayout({
    amountRands: 0.5,
    merchantReference: `t1-${Date.now()}`,
    accountNumber: "62123456789",
    bankGroupId,
    branchCode,
  });
  return { http: r.status, body: r.json };
});

await run("API-2", "Payout above R20 (21.00)", async () => {
  const r = await requestPayout({
    amountRands: 21,
    merchantReference: `t2-${Date.now()}`,
    accountNumber: "62123456789",
    bankGroupId,
    branchCode,
  });
  return { http: r.status, body: r.json };
});

await run("API-8", "CDV account 1234567890 amount R10", async () => {
  const r = await requestPayout({
    amountRands: 10,
    merchantReference: `t8-${Date.now()}`,
    accountNumber: "1234567890",
    bankGroupId,
    branchCode,
  });
  return { http: r.status, body: r.json };
});

let validPayoutId = null;
await run("API-valid", "Valid R10 payout (needed for API-9 / Tests 3-5 seed)", async () => {
  const r = await requestPayout({
    amountRands: 10,
    merchantReference: `t9-${Date.now()}`,
    accountNumber: "62123456789",
    bankGroupId,
    branchCode,
  });
  validPayoutId = r.json?.payoutId || r.json?.PayoutId || r.json?.id || r.json?.Id || null;
  return { http: r.status, payoutId: validPayoutId, body: r.json };
});

await run("API-9", "GET getpayout", async () => {
  if (!validPayoutId) return { skipped: true, reason: "No payoutId from valid request" };
  const res = await fetch(`${BASE}/v1/getpayout?payoutId=${encodeURIComponent(validPayoutId)}`, {
    headers,
  });
  return { http: res.status, body: await res.json().catch(() => ({})) };
});

for (const mock of [
  { id: "MOCK-1", flag: "IsAccountDecryptionFailed", title: "Account decryption failed" },
  { id: "MOCK-2", flag: "IsNotVerifiedResponse", title: "Not verified response" },
  { id: "MOCK-3", flag: "IsAccountDecryptionKeyMissing", title: "Decryption key missing" },
]) {
  await run(mock.id, mock.title, async () => {
    const before = await mockGetConfig();
    const set = await mockSetConfig({ [mock.flag]: true });
    const after = await mockGetConfig();
    const payout = await fetch(`${BASE}/mock/v1/requestpayout`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        siteCode: SITE,
        amount: 10,
        merchantReference: `m-${mock.id}-${Date.now()}`,
        customerBankReference: `m${mock.id.replace(/\D/g, "")}${Date.now()}`.slice(0, 20),
        isRtc: false,
        notifyUrl: `${PUBLIC}/api/webhooks/ozow-payout-notification`,
        bankingDetails: {
          bankGroupId,
          accountNumber: "00",
          branchCode,
        },
      }),
    });
    const payoutJson = await payout.json().catch(() => ({}));
    const pid = payoutJson.payoutId || payoutJson.PayoutId || payoutJson.id;
    let getMock = null;
    if (pid) {
      const g = await fetch(`${BASE}/mock/v1/getpayout?payoutId=${encodeURIComponent(pid)}`, {
        headers,
      });
      getMock = { http: g.status, body: await g.json().catch(() => ({})) };
    }
    await mockSetConfig({});
    return {
      getConfigBefore: { http: before.status, body: before.json },
      setConfig: { http: set.status, body: set.json },
      getConfigAfter: { http: after.status, body: after.json },
      mockRequestHttp: payout.status,
      mockRequest: payoutJson,
      getMockPayout: getMock,
    };
  });
}

console.log("\n==== SUMMARY ====");
for (const r of results) {
  console.log(r.id, r.ok ? "RAN" : "ERROR", r.title);
}
