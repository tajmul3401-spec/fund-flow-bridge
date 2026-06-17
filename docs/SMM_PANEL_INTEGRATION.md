# APB Middleware — SMM Panel Integration Guide

এই ডকুমেন্ট আপনার **SMM Panel (client side)** ডেভেলপারদের জন্য। APB Middleware হচ্ছে একটা payment automation bridge — আপনার ইউজার যখন "Add Funds" করতে চায়, আপনি APB-কে একটা API call করেন, APB একটা gateway URL ফেরত দেয়, আপনি ইউজারকে সেখানে redirect করেন। বাকি সব (provider login, payment method click, gateway redirect, success confirmation, webhook) APB হ্যান্ডেল করে।

---

## 1. Base URL

```
Production:  https://<your-apb-domain>/api/public/v1
```

## 2. Authentication

প্রত্যেক request-এ header:

```
Authorization: Bearer apb_xxxxxxxx_yyyyyyyyyyyyyyyyyyyyyyyy
Content-Type:  application/json
```

API Key Admin Dashboard → **API Clients** → "+ New Client" থেকে পাবেন। Key একবারই দেখানো হবে — সাথে সাথে save করুন।

প্রতিটা client-এর সাথে একটা **HMAC Secret** (`whsec_...`) আসবে — এটা webhook signature verify করতে লাগবে।

---

## 3. Endpoints

### 3.1 `POST /checkout/initialize`

নতুন payment session শুরু করে।

**Request body:**
```json
{
  "smm_transaction_id": "ORDER-2026-00123",
  "client_user_id": "user_4521",
  "amount": 500.00,
  "currency": "BDT",
  "payment_method_target": "bkash",
  "provider_id": "uuid-optional",
  "metadata": { "note": "any json" }
}
```

| Field | Type | Required | বর্ণনা |
|---|---|---|---|
| `smm_transaction_id` | string | ✅ | আপনার panel-এর unique order ID। একই ID আবার পাঠালে existing session ফেরত আসবে (idempotent)। |
| `client_user_id` | string | ✅ | আপনার panel-এর user ID। |
| `amount` | number | ✅ | কত টাকা add হবে (client currency-তে)। |
| `currency` | string(3) | ✅ | `BDT`, `USD`... |
| `payment_method_target` | string | ✅ | `bkash` / `nagad` / `rocket` / `upay` / `card` ইত্যাদি। |
| `provider_id` | uuid | ❌ | omit করলে client-এর default provider use হবে। |
| `metadata` | object | ❌ | যেকোনো extra info। |

**Response 201:**
```json
{
  "apb_session_id": "aps_a1b2c3...",
  "status": "INITIALIZED",
  "gateway_url": "https://<your-apb-domain>/checkout/aps_a1b2c3..."
}
```

➡️ **আপনার কাজ:** ইউজারকে `gateway_url`-এ redirect করুন।

---

### 3.2 `GET /checkout/:apb_session_id/status`

যেকোনো সময় current status check করতে পারেন (polling বা manual lookup-এর জন্য)।

**Response:**
```json
{
  "apb_session_id": "aps_a1b2c3...",
  "status": "COMPLETED",
  "amount": 500,
  "currency": "BDT",
  "provider_reference": "TRX9HJK22",
  "completed_at": "2026-06-17T18:02:14Z"
}
```

**Status গুলো:**

| Status | মানে |
|---|---|
| `INITIALIZED` | Job queue-এ আছে |
| `WORKER_PICKED` | Worker browser চালু করেছে |
| `CHECKOUT_READY` | Provider gateway URL ready, user redirect হচ্ছে |
| `REDIRECTED` | User payment page-এ গেছে |
| `COMPLETED` | ✅ payment success |
| `FAILED` | ❌ automation / payment fail |
| `PENDING_MANUAL_AUDIT` | ⚠️ unclear — admin manually check করবে |

---

## 4. Webhooks (recommended — polling না করে এটা use করুন)

API Client create করার সময় `webhook_url` দিতে হবে। প্রত্যেক status change-এ আমরা POST করব।

**Headers:**
```
X-APB-Signature: sha256=<hex>
X-APB-Event:     transaction.completed
Content-Type:    application/json
```

**Body example:**
```json
{
  "event": "transaction.completed",
  "apb_session_id": "aps_a1b2c3...",
  "transaction_id": "uuid",
  "smm_transaction_id": "ORDER-2026-00123",
  "timestamp": "2026-06-17T18:02:14Z",
  "data": {
    "final_status": "COMPLETED",
    "amount": 500,
    "currency": "BDT",
    "provider_reference": "TRX9HJK22"
  }
}
```

**Events:**
- `transaction.checkout_ready`
- `transaction.redirected`
- `transaction.completed`  ← এটাতে user-এর balance add করুন
- `transaction.failed`
- `transaction.pending_manual_audit`

### Signature verification (Node example)

```js
import crypto from "crypto";

function verify(rawBody, headerSig, hmacSecret) {
  const expected = "sha256=" + crypto
    .createHmac("sha256", hmacSecret)
    .update(rawBody)
    .digest("hex");
  return crypto.timingSafeEqual(
    Buffer.from(headerSig),
    Buffer.from(expected)
  );
}
```

**গুরুত্বপূর্ণ:** raw body-র উপর verify করতে হবে, JSON.parse করার আগে।

---

## 5. Full integration flow

```
[SMM Panel User]                [Your SMM Panel]              [APB Middleware]            [Provider Panel]
      │                                │                              │                            │
      │  "Add 500 BDT via bKash"       │                              │                            │
      │───────────────────────────────▶│                              │                            │
      │                                │  POST /checkout/initialize   │                            │
      │                                │─────────────────────────────▶│                            │
      │                                │   gateway_url                │                            │
      │                                │◀─────────────────────────────│                            │
      │  302 redirect to gateway_url   │                              │                            │
      │◀───────────────────────────────│                              │                            │
      │                                                               │ (worker logs in, clicks)   │
      │                                                               │───────────────────────────▶│
      │                                                               │  real gateway URL          │
      │                                                               │◀───────────────────────────│
      │  redirect to real bKash page                                  │                            │
      │◀──────────────────────────────────────────────────────────────│                            │
      │  user pays                                                                                 │
      │  provider returns to APB callback                             │                            │
      │  APB marks COMPLETED, fires webhook                           │                            │
      │                                │  webhook: transaction.completed                            │
      │                                │◀─────────────────────────────│                            │
      │                                │  (panel adds balance)        │                            │
      │  redirect back to your panel   │                              │                            │
      │◀───────────────────────────────│                              │                            │
```

---

## 6. Error responses

```json
{ "error": "invalid_payload", "details": { ... } }      // 400
{ "error": "unauthorized" }                              // 401
{ "error": "provider_not_found" }                        // 400
{ "error": "provider_disabled" }                         // 503
{ "error": "rate_limited" }                              // 429
```

---

## 7. Best practices

1. **Idempotency** — same `smm_transaction_id` একাধিকবার call করলে নতুন charge হবে না।
2. **Balance update শুধু webhook থেকে** — frontend redirect-এ ভরসা করবেন না।
3. **HMAC verify না করলে credit করবেন না** — কেউ fake webhook পাঠাতে পারে।
4. **Timeout** — 10 মিনিটের মধ্যে status `COMPLETED` না হলে user-কে retry option দিন।
5. **Logging** — webhook receive করে immediately 200 ফেরত দিন, processing background-এ করুন।
