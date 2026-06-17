
# Automated Payment Bridge (APB) — Implementation Plan

## গুরুত্বপূর্ণ architecture decision (পড়ুন আগে)

PRD-র মূল কাজ হলো Perfect Panel-এ headless browser দিয়ে login → Add Fund → Bangladeshi method → gateway → card → checkout URL capture। Lovable Cloud-এর backend Cloudflare Workers-এ চলে, যেখানে **Puppeteer/Playwright/Chromium চালানো যায় না** (native binary, subprocess, file system — কিছুই support করে না)। তাই system দুই ভাগে ভাগ করতে হবে:

```text
┌────────────────┐   HTTPS API    ┌──────────────────────┐   Job poll/WS   ┌────────────────────┐
│  Your SMM      │ ─────────────► │  APB Control Plane   │ ◄────────────── │  Automation Worker │
│  Panel (yours) │ ◄─ webhook ─── │  (Lovable — this app)│ ──── result ──► │  (Node+Playwright, │
└────────────────┘                │  • REST API          │                 │   you deploy on    │
                                  │  • Admin dashboard   │                 │   VPS/Render/Fly)  │
                                  │  • DB + queue        │                 └─────────┬──────────┘
                                  │  • Webhooks          │                           │
                                  │  • Gateway-frame     │                           ▼
                                  │  • API docs          │                  Perfect Panel (provider)
                                  └──────────────────────┘                  login → add fund → URL
```

Lovable build করবে **Control Plane + Worker source code (একটা আলাদা folder `automation-worker/` হিসেবে repo-তে দেব, যেটা আপনি VPS-এ deploy করবেন)**। Worker না চললে system কাজ করবে না — এটা PRD-র browser automation requirement-এর একমাত্র valid path।

---

## Lovable Cloud Activate

Database (PostgreSQL), Auth (admin login), Storage, Server functions — সবই Lovable Cloud দিয়ে হবে। প্রথমেই enable করব।

## Database Schema

```text
providers          — provider panel credentials (AES-GCM encrypted), base URL, payment-flow config
api_clients        — SMM panel API keys (hashed), webhook URL, HMAC secret, rate limits
transactions       — apb_session_id, smm_transaction_id, client_id, amount, currency,
                     status (INITIALIZED|WORKER_PICKED|CHECKOUT_READY|REDIRECTED|
                     COMPLETED|FAILED|TIMEOUT|PENDING_MANUAL_AUDIT),
                     checkout_url, provider_reference, error, timestamps
automation_jobs    — queue rows worker polls; locked_by/locked_at for concurrency
webhook_deliveries — outbound webhook attempts to SMM panel (retry/backoff log)
audit_logs         — every state transition + actor
admin_users        — Lovable Cloud auth, role via separate user_roles table
user_roles         — admin/operator roles (security-definer has_role fn)
```

All sensitive columns (provider password, API client secrets) encrypted at rest with `pgcrypto` + a server-only key. RLS on every table; only `service_role` (server functions) writes.

## APB REST API (matches PRD §3)

All under `src/routes/api/public/v1/` so external SMM panels reach them without Lovable auth. Each handler manually verifies `Authorization: Bearer <api_key>` + HMAC signature.

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/public/v1/checkout/initialize` | SMM panel creates a session; APB returns `checkout_url` (the gateway-frame URL) within ~2.5s |
| GET  | `/api/public/v1/checkout/:session_id/status` | Poll status |
| POST | `/api/public/v1/worker/claim` | **Worker-only.** Atomically claim N pending jobs |
| POST | `/api/public/v1/worker/jobs/:id/result` | Worker reports captured checkout URL or error |
| POST | `/api/public/v1/worker/jobs/:id/heartbeat` | Keep-alive while browsing |
| POST | `/api/public/v1/provider-callback/:session_id` | Provider success/cancel landing → 302 to SMM dashboard + fire SMM webhook |

Outbound webhook to SMM panel (PRD §3.2 Endpoint 2): `POST <client.webhook_url>` with `event: transaction.settled`, HMAC-SHA256 `verification_hash`, exponential backoff retries (5 attempts).

## Request → Response Flow (latency budget)

1. SMM panel → `/checkout/initialize` (Bearer + HMAC).
2. APB validates, creates `transactions` row + `automation_jobs` row (status `INITIALIZED`), returns `checkout_url = /v1/checkout/gateway-frame?session=…` immediately (no waiting on worker → SMM UI's 2-4s holding screen stays clean).
3. Worker (polling every 500ms or via WebSocket) claims job, opens Perfect Panel, logs in (cached session cookie reused), Add Fund → selects BD method → gateway → card → captures real checkout URL, POSTs back to `/worker/jobs/:id/result`.
4. Browser sits on gateway-frame page (polls status every 600ms). When `CHECKOUT_READY`, client-side JS redirects to the real provider checkout URL inside the same tab — with `Referrer-Policy: no-referrer` and a brand-masking title.
5. User pays. Provider's success URL was pre-set to APB's `/provider-callback/:session_id` (we override at the automation step where possible; otherwise we register APB as the return URL during checkout selection).
6. Callback: verify signature/state → 302 redirect to `client.return_url` on the SMM panel → asynchronously POST webhook to SMM panel to credit balance.
7. If worker fails / timeout > 5s → status `FAILED`, gateway-frame shows "Gateway occupied, please try again" (PRD §5).
8. If payment succeeds but webhook signature fails → status `PENDING_MANUAL_AUDIT`, shows in admin dashboard queue.

## Admin Dashboard (Lovable side, behind auth)

Routes under `_authenticated/admin/`:
- **Dashboard** — live transaction stream, success rate, p95 latency, worker health.
- **Transactions** — filter/search, full timeline (state transitions, worker logs, webhook attempts), manual retry/credit.
- **Providers** — add/edit Perfect Panel credentials, flow config (which BD method, which gateway, which card option to click — selector chain), test-login button.
- **API Clients** — issue API keys for SMM panels, set webhook URL + HMAC secret + return URL, rotate keys.
- **Manual Audit Queue** — PRD §5 quarantined transactions, approve/reject.
- **Workers** — registered automation workers, last heartbeat, claimed jobs.
- **Logs** — audit log, webhook delivery log.

## Gateway-Frame Page (PRD §4.2 brand masking)

`/checkout/gateway-frame?session=…` — full-screen branded loading UI ("Securing Secure Payment Pathway…"), polls status, then `window.location.replace(checkoutUrl)`. Meta `referrer="no-referrer"`, no `document.referrer` leak. Configurable brand name/logo per `api_client`.

## API Docs Page

Public `/docs` route — endpoints, request/response examples (copy from PRD §3.2), auth/HMAC instructions, webhook payload spec, error codes, sample curl + Node/PHP snippets. Built as static MDX-style React content.

## Automation Worker (separate `automation-worker/` folder in repo)

Node 20 + Playwright (Chromium). Single file `worker.ts` + Dockerfile + README with deploy steps for Render/Railway/VPS. Env vars: `APB_BASE_URL`, `WORKER_API_KEY`. Behavior:
- Polls `/worker/claim` (configurable concurrency, default 5).
- Per provider, maintains a persistent BrowserContext with stored cookies; silent re-login on session expiry (PRD §5 dynamic re-auth).
- Executes a config-driven selector chain (so adding a new BD method = config change, no redeploy).
- Reports back within 2.5s target; heartbeats every 1s while navigating; aborts at 5s timeout.
- Logs anonymized; never sends provider credentials anywhere.

**You deploy this separately.** Lovable provides the source + docs. Without it, Lovable side returns `503 worker_unavailable`.

## Security

- Provider credentials & client secrets: AES-256-GCM (PRD §4.2). Key stored as Lovable Cloud secret `APB_ENCRYPTION_KEY`.
- Every inbound API request: Bearer token (constant-time compare against hashed key) + HMAC-SHA256 over body+timestamp, 5-minute timestamp window (anti-replay).
- Outbound webhooks signed identically.
- Rate limiting per api_client (in DB, simple token bucket).
- Admin dashboard: Lovable Cloud email/password + Google, role check via `has_role()` security-definer fn (roles in separate `user_roles` table).
- All state transitions written to `audit_logs`.

## Build Order

1. Enable Lovable Cloud; create schema + RLS + GRANTs + `has_role`.
2. Auth + admin shell + empty dashboard.
3. APB REST endpoints (initialize, status, worker claim/result/heartbeat, provider-callback) with HMAC + Bearer.
4. Gateway-frame page + brand-masking.
5. Webhook dispatcher (retry with backoff).
6. Admin dashboard pages (transactions, providers, api_clients, audit queue, workers, logs).
7. `/docs` API documentation page.
8. `automation-worker/` folder — Playwright worker + Dockerfile + deploy README.
9. Seed test api_client + provider for end-to-end test.

## Out of scope (PRD §4.1 FR-05)

Multi-currency conversion left as a stored exchange-rate field per provider (manual), not a live FX feed. Can add later.

## Technical caveat আপনাকে জানিয়ে রাখি

- Worker না deploy করা পর্যন্ত checkout flow কাজ করবে না — Lovable শুধু control plane।
- Perfect Panel UI/HTML বদলালে worker-এর selector config update লাগবে।
- "1500-3000ms" latency target Worker-এর network + provider response-এর উপর depend করে — Worker provider-এর geographically কাছে hosted হলে অনেক ভালো হবে।

Approve করলে এই order-এই build শুরু করব।
