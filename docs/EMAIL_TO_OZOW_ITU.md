# Email to Ozow – Itu (copy & paste)

Replace bracketed placeholders before sending.

---

**To:** Itu (Ozow Integration Manager)  
**Subject:** Easy Fuel – Ozow One API + Payouts – staging setup & next steps

---

Hi Itu,

Thank you for the onboarding email and sandbox credentials. We have configured staging on our side and integrated Easy Fuel using the **Ozow One API** (OAuth client credentials + `POST /v1/payments`) as per the [One API quickstart](https://hub.ozow.com/docs/one-api/yu4y4luah3arn-quickstart-payments). We are **not** using the legacy `stagingapi.ozow.com` pay-in bridge.

**Integration scope**

We use Ozow for:

1. **Pay-ins (One API)** – customer fuel delivery payments (pay after delivery) and driver depot payments to suppliers  
2. **Payouts API** – automatic disbursement of net amounts to driver and supplier bank accounts after successful pay-ins (platform fee retained by Easy Fuel)

Staging site code: **TSTSTE0001**. 
Application URL: **https://portal.easyfuel.ai**.

---

**Pay-in (One API)**

| Item | Value |
|------|--------|
| **Token endpoint** | `POST https://stagingone.ozow.com/v1/token` (`client_credentials`, `scope=payment`) |
| **Create payment** | `POST https://stagingone.ozow.com/v1/payments` |
| **NotifyUrl (webhook)** | https://portal.easyfuel.ai/api/webhooks/ozow-payin |
| **Success redirect** | https://portal.easyfuel.ai/payment/success |
| **Cancel redirect** | https://portal.easyfuel.ai/payment/cancel |

---

**Payout staging setup (as requested)**

| Item | Details |
|------|---------|
| **Low float alert contact** | [Full Name], [Mr/Mrs/Miss], [email@easyfuel.ai], [+27 XX XXX XXXX] |
| **Website URL** | https://portal.easyfuel.ai |
| **Notification URL** | https://portal.easyfuel.ai/api/webhooks/ozow-payout-notification |
| **Verification URL** | https://portal.easyfuel.ai/api/webhooks/ozow-payout-verification |
| **Access Token (24 characters)** | A7K9M2P8X4N6Q1R5T3V8Y2Z1 |

---

**Estimated go-live**

| Milestone | Target |
|-----------|--------|
| Pay-ins – staging testing complete | [e.g. 3 weeks from today] |
| Pay-ins – production | [e.g. 5–6 weeks from today] |
| Payouts – staging testing | [e.g. 4 weeks from today, after pay-ins pass] |
| Payouts – production | TBD after staging sign-off |

---

**Questions for Ozow (only what we cannot get from Hub docs or our integration)**


1. **Payout staging dashboard** – Please enable our staging payout dashboard and advise how we top up test float for payout testing.

2. **Payout API credentials & submit endpoint** – Please confirm the exact **Request Payout** POST path on `stagingpayoutsapi.ozow.com`, the JSON request schema (including `bankGroupId` for SA banks), and whether the **Payout API key** is separate from our One API Client Id/Secret.

3. **Payout verification** – Please provide the **AccountNumberDecryptionKey** and any payout verification/notification payload docs needed for staging sign-off.

4. **Production go-live** – What is the process and timeline for production Client Id/Secret, Site Code, and payout dashboard after staging testing passes?

---

**All Easy Fuel URLs for Ozow configuration**

**Website**

- https://portal.easyfuel.ai

**Pay-in (One API)**

- NotifyUrl: https://portal.easyfuel.ai/api/webhooks/ozow-payin  
- Success: https://portal.easyfuel.ai/payment/success  
- Cancel: https://portal.easyfuel.ai/payment/cancel  

**Payouts API**

- Notification: https://portal.easyfuel.ai/api/webhooks/ozow-payout-notification  
- Verification: https://portal.easyfuel.ai/api/webhooks/ozow-payout-verification  
- Access token (24 characters): A7K9M2P8X4N6Q1R5T3V8Y2Z1  

**Staging Ozow endpoints (our reference)**

- One API base: https://stagingone.ozow.com  
- Payouts API base: https://stagingpayoutsapi.ozow.com  
- Site code: TSTSTE0001  

---

We are ready to begin end-to-end staging tests as soon as the payout dashboard is active. Pay-ins are implemented per One API Hub docs; we will run staging pay-in tests and only escalate to you if the checkout URL or webhook hash does not match our implementation.

Please let us know if you need a technical call with our development team.

Best regards,  
[Your full name]  
[Your job title]  
Easy Fuel  
[your email]  
[+27 phone number]
