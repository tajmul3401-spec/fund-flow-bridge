import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/docs")({
  head: () => ({
    meta: [
      { title: "APB Middleware API Docs" },
      { name: "description", content: "REST API reference for the Automated Payment Bridge middleware." },
    ],
  }),
  component: DocsPage,
});

function DocsPage() {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex max-w-4xl items-center justify-between p-4">
          <Link to="/" className="text-sm font-semibold">APB Middleware</Link>
          <Link to="/admin" className="text-xs underline text-muted-foreground">Admin</Link>
        </div>
      </header>
      <main className="mx-auto max-w-4xl space-y-10 p-8">
        <section>
          <h1 className="text-3xl font-bold">API Reference</h1>
          <p className="mt-2 text-sm text-muted-foreground">All endpoints are under <code className="rounded bg-muted px-1 py-0.5">/api/public/v1</code>. Authenticate with your API key as <code className="rounded bg-muted px-1 py-0.5">Authorization: Bearer apb_xxx_yyy</code>.</p>
        </section>

        <Endpoint
          method="POST"
          path="/api/public/v1/checkout/initialize"
          desc="Start an add-fund automation session. Returns a gateway URL to redirect your user to."
          req={`{
  "smm_transaction_id": "your-internal-id",   // unique per client; idempotent
  "client_user_id": "smm-user-12345",
  "amount": 500.00,
  "currency": "BDT",
  "payment_method_target": "bkash",           // bkash | nagad | rocket | upay | card ...
  "provider_id": "uuid-optional",             // omit to use API client default
  "metadata": { "any": "json" }
}`}
          res={`{
  "apb_session_id": "aps_xxx",
  "status": "INITIALIZED",
  "gateway_url": "https://your-domain/checkout/aps_xxx"
}`}
        />

        <Endpoint
          method="GET"
          path="/api/public/v1/checkout/:apb_session_id/status"
          desc="Get current status of a transaction."
          res={`{
  "apb_session_id": "aps_xxx",
  "status": "COMPLETED",
  "amount": 500, "currency": "BDT",
  "provider_reference": "TXN-12345",
  "checkout_url": "https://...",
  "completed_at": "2026-06-17T17:45:00Z"
}`}
        />

        <section>
          <h2 className="text-2xl font-semibold">Webhooks</h2>
          <p className="mt-2 text-sm text-muted-foreground">We POST events to your configured webhook URL with header <code className="rounded bg-muted px-1 py-0.5">X-APB-Signature: sha256=&lt;hex&gt;</code> (HMAC-SHA256 of raw body using your HMAC secret).</p>
          <ul className="mt-3 list-disc pl-5 text-sm">
            <li><code>transaction.checkout_ready</code> — automation produced the provider checkout URL</li>
            <li><code>transaction.redirected</code> — user redirected to provider page</li>
            <li><code>transaction.completed</code> — payment confirmed</li>
            <li><code>transaction.failed</code> — automation or payment failed</li>
            <li><code>transaction.pending_manual_audit</code> — provider returned an ambiguous status</li>
          </ul>
          <pre className="mt-3 overflow-x-auto rounded-md bg-muted p-3 text-xs">{`{
  "event": "transaction.completed",
  "apb_session_id": "aps_xxx",
  "transaction_id": "uuid",
  "timestamp": "2026-06-17T17:45:00Z",
  "data": { "final_status": "COMPLETED" }
}`}</pre>
        </section>

        <section>
          <h2 className="text-2xl font-semibold">Status flow</h2>
          <pre className="mt-3 overflow-x-auto rounded-md bg-muted p-3 text-xs">{`INITIALIZED → WORKER_PICKED → CHECKOUT_READY → REDIRECTED → COMPLETED
                                                            ↘ FAILED / PENDING_MANUAL_AUDIT`}</pre>
        </section>

        <section>
          <h2 className="text-2xl font-semibold">Worker API (internal)</h2>
          <p className="mt-2 text-sm text-muted-foreground">Used by the Playwright automation worker. Auth: <code>Authorization: Bearer wrk_xxx</code>.</p>
          <ul className="mt-2 text-sm space-y-1">
            <li><code>POST /api/public/v1/worker/claim</code> — claim N pending jobs (default 1, max 10)</li>
            <li><code>POST /api/public/v1/worker/jobs/:id/heartbeat</code> — keep job lock alive (every &lt; 15s)</li>
            <li><code>POST /api/public/v1/worker/jobs/:id/result</code> — submit success or failure</li>
          </ul>
        </section>
      </main>
    </div>
  );
}

function Endpoint({ method, path, desc, req, res }: { method: string; path: string; desc: string; req?: string; res: string }) {
  return (
    <section className="rounded-lg border border-border bg-card p-5">
      <div className="flex items-center gap-2">
        <span className="rounded bg-primary px-2 py-0.5 text-xs font-semibold text-primary-foreground">{method}</span>
        <code className="text-sm">{path}</code>
      </div>
      <p className="mt-2 text-sm text-muted-foreground">{desc}</p>
      {req && (<><div className="mt-3 text-xs uppercase tracking-wider text-muted-foreground">Request body</div><pre className="mt-1 overflow-x-auto rounded-md bg-muted p-3 text-xs">{req}</pre></>)}
      <div className="mt-3 text-xs uppercase tracking-wider text-muted-foreground">Response</div>
      <pre className="mt-1 overflow-x-auto rounded-md bg-muted p-3 text-xs">{res}</pre>
    </section>
  );
}
