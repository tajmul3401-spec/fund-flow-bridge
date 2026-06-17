# APB Automation Worker

External Node.js + Playwright worker that polls the APB Middleware for pending automation jobs, drives the provider panel browser session, and reports back checkout URLs.

## Why external?
Lovable Cloud runs on Cloudflare Workers — no Playwright / Chromium support. This worker MUST be deployed on a VPS, Fly Machines, Render, Railway, or any host that can run a headless browser.

## Setup

```bash
cd automation-worker
npm install
npx playwright install chromium

cp .env.example .env
# Edit .env with:
#   APB_BASE_URL=https://your-apb-domain.lovable.app
#   APB_WORKER_TOKEN=wrk_xxx   (from Admin → Workers → + Create worker)
#   POLL_INTERVAL_MS=1000
#   CONCURRENCY=3

npm start
```

## Flow per job
1. `POST /api/public/v1/worker/claim` → receives job(s) with `provider.username`, `provider.password`, `provider.base_url`, `provider.flow_config`, `amount`, `payment_method_target`, `provider_callback_url`.
2. Open or reuse a `BrowserContext` for that provider (cookies persisted on disk so re-login is rare).
3. Drive selectors from `flow_config.selectors` (configurable per provider, no code change to add a new BD method).
4. Heartbeat `POST /worker/jobs/:id/heartbeat` every 5s while running.
5. Capture the final gateway/card-form URL and POST it back:
   ```
   POST /worker/jobs/:id/result  { "outcome": "success", "checkout_url": "...", "provider_reference": "..." }
   ```
   On failure:
   ```
   POST /worker/jobs/:id/result  { "outcome": "failure", "error": "...", "retryable": true }
   ```
6. Inject `provider_callback_url` into the "return URL" field of the provider page so the user is redirected back to APB (which then redirects to the SMM panel).

## Provider `flow_config` shape (example for a Perfect-Panel-style provider)
```json
{
  "login": {
    "url_path": "/login",
    "username_selector": "input[name=email]",
    "password_selector": "input[name=password]",
    "submit_selector": "button[type=submit]",
    "success_url_contains": "/dashboard"
  },
  "add_funds": {
    "url_path": "/addfund",
    "amount_selector": "input[name=amount]",
    "method_selector_template": "[data-method=\"{target}\"]",
    "submit_selector": "button.btn-pay",
    "gateway_selector_chain": [".gateway-option-bd", ".second-gateway", ".card-option"],
    "final_url_capture": "iframe[src*=\"pay\"]"
  }
}
```

## Production notes
- Run with `pm2` or systemd. Single process, internal concurrency via `CONCURRENCY`.
- Mount `./browser-profiles/` as a persistent volume so re-login is rare.
- Log job IDs only — never log provider passwords or `checkout_url` (contains payment tokens).
- The middleware times out a job lock if heartbeat stops for >15s, so a crashed worker auto-releases jobs.
