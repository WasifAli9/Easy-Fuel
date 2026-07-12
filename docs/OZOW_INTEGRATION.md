# Ozow OneAPI integration – Easy Fuel

## Environment

Configure in server `.env`:

| Variable | Purpose |
|----------|---------|
| `OZOW_SITE_CODE`, `OZOW_CLIENT_ID`, `OZOW_CLIENT_SECRET` | Pay-in credentials from Itu |
| `OZOW_ONE_API_BASE_URL` | Staging: `https://stagingone.ozow.com` · Production: `https://one.ozow.com` |
| `PUBLIC_APP_URL` | HTTPS base URL (e.g. `https://portal.easyfuel.ai`) |
| `OZOW_PAYOUT_API_BASE_URL` | Staging: `https://stagingpayoutsapi.ozow.com` |
| `OZOW_PAYOUT_SUBMIT_PATH` | Confirm with Itu (e.g. `/v1/requestpayout`) |
| `OZOW_PAYOUT_API_KEY` | Payout API key from Ozow dashboard (may differ from pay-in key) |
| `OZOW_PAYOUT_ACCESS_TOKEN` | 24-char string for payout verification webhooks |
| `OZOW_PAYIN_DRY_RUN=true` | Skip live Ozow checkout and auto-complete pay-ins (staging/dev). Does **not** require `OZOW_IS_TEST`. |
| `OZOW_WEBHOOK_SKIP_VERIFY=true` | **Staging only** with `OZOW_IS_TEST=true` if hash signing fails |
| `PAYMENT_REMINDER_AFTER_HOURS=24` | Hours after delivery before payment reminder push |

Apply DB patch: `schema/patches/005_ozow_payment_ledger.sql`

## Webhooks (public HTTPS)

| URL | Purpose |
|-----|---------|
| `/api/webhooks/ozow-payin` | Pay-in completion (customer orders, depot orders) |
| `/api/webhooks/ozow-payout-notification` | Payout result |
| `/api/webhooks/ozow-payout-verification` | Payout verification before disbursement |

Admin diagnostics: `GET /api/admin/ozow-status`

## Payment flows

1. **Customer delivery (pay after delivery)**  
   Driver completes → customer pays via Ozow → webhook marks `paid` → driver payout queued.

2. **Driver depot order (Ozow only)**  
   Supplier accepts (requires supplier bank in KYB) → driver pays → webhook → supplier payout queued.

Platform fee % in `app_settings`: `customer_order_platform_fee_percent`, `depot_order_platform_fee_percent`.

---

## Ozow Hub doc alignment

References:

- [One API – Quickstart Payments](https://hub.ozow.com/docs/one-api/yu4y4luah3arn-quickstart-payments)
- [Payouts – Integration overview](https://hub.ozow.com/docs/payouts-api/p91zsgmrgnnm2-payouts-integration)

### Pay-ins (One API)

| Ozow docs | Easy Fuel today | Status |
|-----------|-----------------|--------|
| OAuth token: `POST {ONE_API}/v1/token` with `client_id`, `client_secret`, `grant_type=client_credentials`, `scope=payments` | Same – `ozow-service.ts` (Itu: docs wrongly say `payment`) | **OK** |
| Create payment: `POST {ONE_API}/v1/payments` (flat JSON: `amount:{currency,value}`, `region`, `siteCode`, `merchantReference`, `expireAt`) → `redirectUrl` | Same – no legacy `stagingapi` bridge | **OK** |
| `NotifyUrl` webhook (HTTPS) | `/api/webhooks/ozow-payin` | **OK** |
| Verify webhook hash (`Hash` / `HashCheck`) | SHA256 with `OZOW_CLIENT_SECRET` | **OK** (staging skip flag available) |
| Success / cancel redirect URLs | `/payment/success`, `/payment/cancel` | **OK** |
| Optional: `GET /v1/payments/{id}` status check | `getOneApiPaymentById()` available | **OK** |
| Platform commission split | Calculated in app; gross pay-in, net payout only | **OK** – Ozow does not auto-split; your code does |

### Payouts API

Per [Payouts integration](https://hub.ozow.com/docs/payouts-api/p91zsgmrgnnm2-payouts-integration): Step 1 availability → Step 2 submit → Step 3 verification webhook → Step 4 status check.

| Ozow docs | Easy Fuel today | Status |
|-----------|-----------------|--------|
| Base URL `https://stagingpayoutsapi.ozow.com` | `OZOW_PAYOUT_API_BASE_URL` | **OK** |
| Auth: `ApiKey` + `SiteCode` headers | `OZOW_PAYOUT_API_KEY` + `OZOW_SITE_CODE` | **OK** – set Payout API Key from dashboard |
| Step 1: `GET /v1/getavailablebanks` | `getAvailableBanks()` + bank-name → `bankGroupId` | **OK** |
| Step 2: Request Payout | Ozow schema: `merchantReference`, `bankingDetails`, AES account, `hashCheck` | **OK** |
| Step 3: Verification webhook | Returns `verified` + `accountNumberDecryptionKey` | **OK** |
| Step 4: `GET /v1/getpayout` | `fetchOzowPayoutStatus()` | **OK** |
| Payout notification webhook | Complete / cancelled / verificationSuccess handled | **OK** |
| End-to-end staging sign-off | Set `OZOW_PAYOUT_DRY_RUN=false` after key is set | **Pending Itu tests** |

---

## Risk mitigations (built in)

| Risk | Mitigation in code |
|------|-------------------|
| Pay-after-delivery credit risk | Block new orders if unpaid delivered orders exist; 24h payment reminders; dashboard banner |
| Missing bank details | Block accept offer (driver), depot accept (supplier), and pay-in if bank incomplete |
| OneAPI webhook mismatch | Staging `OZOW_WEBHOOK_SKIP_VERIFY`; admin `/api/admin/ozow-status` |
| Payouts not ready | `OZOW_PAYOUT_DRY_RUN` records ledger without API call |

---

## What YOU must do (checklist)

### 1. Database
- [ ] Run `schema/patches/005_ozow_payment_ledger.sql` on production/staging DB

### 2. Ozow / Itu (external)
- [ ] Email Itu (template below) with webhook URLs, payout token, low-float contact
- [ ] Confirm One API webhook `Hash` verification matches staging callbacks
- [ ] Request **payout staging dashboard** + test float top-up
- [ ] Confirm OneAPI webhook signature documentation

### 3. Server `.env` (production)
- [ ] `PUBLIC_APP_URL=https://portal.easyfuel.ai` (must match live domain)
- [ ] `OZOW_PAYOUT_ACCESS_TOKEN=<24-char random>`
- [ ] Set `OZOW_PAYOUT_DRY_RUN=true` until Ozow confirms payouts work, then `false`
- [ ] Use `OZOW_WEBHOOK_SKIP_VERIFY=true` **only in staging** while testing hashes

### 4. Compliance (your team)
- [ ] Ensure every **driver** completes KYC banking fields before accepting jobs
- [ ] Ensure every **supplier** completes KYB banking before accepting depot orders
- [ ] Admin: review compliance profiles for missing bank details

### 5. Testing
- [ ] Test depot pay-in end-to-end on staging
- [ ] Test customer pay-after-delivery flow
- [ ] Verify webhooks hit `https://portal.easyfuel.ai/api/webhooks/ozow-payin` (not localhost)
- [ ] Check `GET /api/admin/ozow-status` shows all green

### 6. Go-live
- [ ] Switch to production Ozow credentials when Itu provides them
- [ ] Disable `OZOW_IS_TEST`, `OZOW_WEBHOOK_SKIP_VERIFY`, `OZOW_PAYOUT_DRY_RUN`
- [ ] Monitor `payment_transactions` and `payout_transactions` tables

---

## Reply to Ozow integration manager (Itu)

Use the full copy-paste email in **`docs/EMAIL_TO_OZOW_ITU.md`** (One API only — no legacy pay-in bridge).
