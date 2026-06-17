# BestFollows — Provider Flow Config

This document explains the `flow_config` JSON used by the APB worker to drive
the BestFollows Add Funds → EPS card gateway flow, mapped step-by-step to the
screenshots you provided.

---

## Flow overview

1. **Login** — `https://bestfollows.com/login`
2. **Open Add Funds page** — `https://bestfollows.com/addfunds`
3. **Click "Visa | Master..." method card** (Method section)
4. **Enter amount** in the `Amount, USD` input (BDT auto-fills)
5. **Click "Pay" button** (purple)
6. **Intermediate gateway selector** at `pay.itesv.com/bestfollows/checkout/...`
   → click **EPS (Visa/Mastercard Fee 3%)** card
   → click **Pay 26 BDT** button
7. **Final EPS card form** at `pg.eps.com.bd/PG?data=...`
   → **this URL is what we capture and return to the user**.
   The "CARD" tab is already selected by default, so no extra click needed.

The worker stops at step 7: as soon as it sees `pg.eps.com.bd/PG?data=...`
in the browser URL, it sends that URL back to APB as the `checkout_url`,
and APB redirects the SMM-panel user there to enter their card.

---

## flow_config JSON (paste into Admin → Providers → BestFollows → Flow Config)

```json
{
  "login": {
    "url_path": "/login",
    "username_selector": "input[name=\"username\"], input[name=\"email\"]",
    "password_selector": "input[name=\"password\"]",
    "submit_selector": "button[type=\"submit\"]",
    "success_url_contains": "/dashboard"
  },
  "add_funds": {
    "url_path": "/addfunds",

    "method_selector_template": "[data-method=\"{target}\"], .payment-method:has-text(\"{target}\")",

    "amount_selector": "input[name=\"amount\"], input#amount, input[placeholder*=\"Amount\" i]",

    "submit_selector": "button:has-text(\"Pay\"), button.btn-pay, button[type=\"submit\"]",

    "gateway_selector_chain": [
      "div.payment-card:has-text(\"EPS\"), [data-gateway=\"eps\"], img[alt*=\"EPS\" i]",
      "button:has-text(\"Pay\"), button.btn-primary:has-text(\"BDT\")"
    ],

    "final_url_contains": "pg.eps.com.bd/PG",
    "final_url_timeout_ms": 30000
  }
}
```

### Per-payment-method targeting

In `method_selector_template`, the worker replaces `{target}` with the
`payment_method_target` value the SMM panel sent in `/checkout/initialize`.
Recommended values your panel should send for BestFollows:

| `payment_method_target` | Clicks on BestFollows /addfunds |
|-------------------------|---------------------------------|
| `Visa \| Master...`     | The Visa/Mastercard card        |
| `bkash - Nagad`         | The bKash–Nagad card            |
| `Binance Pay`           | The Binance Pay card            |
| `Cryptomus`             | The Cryptomus card              |

The text-based fallback (`:has-text("{target}")`) is what makes new methods
plug-and-play — no code change to add a new BD method, only a new row in your
panel's method map.

---

## How to confirm the selectors (one-time, takes ~5 minutes)

Because BestFollows doesn't expose nice `data-` attributes for every card,
the safest selectors come from inspecting the live DOM:

1. Open `https://bestfollows.com/addfunds`, log in.
2. Right-click the **Visa | Master...** card → **Inspect**.
3. In DevTools, look at the element. You want either:
   - an `id="..."`, OR
   - a `data-method="visa-master"` style attribute, OR
   - the wrapping `<a>` / `<div>` class name.
4. Replace the `method_selector_template` value with what you see, e.g.:
   - if it's `<div class="method-card" data-id="visa">` →
     `"method_selector_template": "[data-id=\"visa\"]"` (hard-coded), or
   - if you want it dynamic → keep `[data-method=\"{target}\"]` and use
     `visa` / `bkash` etc. as the panel's `payment_method_target`.
5. Same drill for the **Amount, USD** input and the **Pay** button —
   confirm the `name`/`id` and tighten the selector if needed.

For the EPS picker page (`pay.itesv.com/...`):

1. Inspect the **EPS** tile → grab its class or a stable attribute.
2. Inspect the bottom **Pay 26 BDT** button → grab its class.
3. Replace the two strings in `gateway_selector_chain` with those.

For the final EPS form (`pg.eps.com.bd/PG?...`):
- Nothing to click — the worker just waits for the URL to contain
  `pg.eps.com.bd/PG` and then captures it.
- "CARD" tab is selected by default, so no extra click is needed.

---

## What "final_url_contains" does

Instead of waiting for an `<iframe>` to load (the old `final_url_capture`
shape), the worker just polls `page.url()` until it contains the substring
`pg.eps.com.bd/PG`. When matched, the full current URL is returned.
This is exactly what your SMM panel user needs: dropping them on that URL
shows them the card form pre-filled with the right merchant ID and amount.

If you later integrate a different gateway (e.g. SSLCommerz), only this
one field changes:

```json
"final_url_contains": "sslcommerz.com/gwprocess"
```

---

## Test plan (after you save the config)

1. Admin → Workers → make sure your VPS worker is **online** (green dot).
2. Admin → Transactions → click **+ New test transaction** with:
   - Provider: BestFollows
   - Amount: 1 USD
   - Payment method target: `Visa | Master...`
3. Open the generated `gateway_url` in an incognito window.
4. Watch the worker logs (`pm2 logs apb-worker`) — you should see:
   ```
   [aps_xxx] login ok
   [aps_xxx] method clicked
   [aps_xxx] amount filled = 1
   [aps_xxx] Pay clicked → pay.itesv.com/...
   [aps_xxx] EPS tile clicked
   [aps_xxx] Pay BDT clicked → pg.eps.com.bd/PG?data=...
   [aps_xxx] OK  url=https://pg.eps.com.bd/PG?data=...
   ```
5. The incognito tab should auto-redirect from your APB gateway page to the
   EPS card form. That's the end of the worker's job — the user types card
   details themselves, and EPS calls your `provider-callback` URL when done.

---

## Troubleshooting

| Symptom in worker logs | Cause | Fix |
|------------------------|-------|-----|
| `Timeout … waiting for selector` on method card | `method_selector_template` wrong | Inspect the card, copy the actual class/data attribute |
| Amount field stays empty | `amount_selector` doesn't match | Change to the real `name=` / `id=` from DevTools |
| Pay button click does nothing | Form needs an extra hidden field | Add it via a `pre_submit_fields` patch (ping me with the screenshot) |
| Stuck at `pay.itesv.com` | EPS tile selector wrong | Update `gateway_selector_chain[0]` |
| Lands on EPS but URL is `pay.itesv.com/...redirect` | `final_url_contains` matched too early | Tighten to `pg.eps.com.bd/PG?data=` |
