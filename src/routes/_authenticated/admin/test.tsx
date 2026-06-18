import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { listProviders, createTestTransaction } from "@/lib/apb/admin.functions";

export const Route = createFileRoute("/_authenticated/admin/test")({ component: TestPage });

type Provider = { id: string; name: string; enabled: boolean };

function TestPage() {
  const loadProviders = useServerFn(listProviders);
  const createTest = useServerFn(createTestTransaction);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [providerId, setProviderId] = useState("");
  const [amount, setAmount] = useState(1);
  const [method, setMethod] = useState("Visa | Master | Amex | Nexus");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ apb_session_id: string; gateway_url: string; smm_transaction_id: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadProviders({}).then(rows => {
      const list = (rows as Provider[]).filter(p => p.enabled);
      setProviders(list);
      if (list[0]) setProviderId(list[0].id);
    });
  }, [loadProviders]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null); setResult(null);
    try {
      const r = await createTest({ data: { provider_id: providerId, amount, payment_method_target: method } });
      setResult(r);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally { setBusy(false); }
  }

  return (
    <div className="p-8 max-w-2xl">
      <h1 className="text-2xl font-semibold">Test Transaction</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Admin Panel থেকে সরাসরি একটা test transaction তৈরি করো — SMM panel / Postman / terminal কিছু লাগবে না।
        Worker online থাকলে job claim করে gateway URL fill করবে।
      </p>

      <form onSubmit={submit} className="mt-6 space-y-4 rounded-lg border border-border bg-card p-5">
        <div>
          <label className="block text-xs font-medium uppercase tracking-wider text-muted-foreground">Provider</label>
          <select
            value={providerId}
            onChange={e => setProviderId(e.target.value)}
            className="mt-1 w-full rounded-md border border-input bg-background p-2 text-sm"
            required
          >
            {providers.length === 0 && <option value="">No enabled provider — add one first</option>}
            {providers.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>

        <div>
          <label className="block text-xs font-medium uppercase tracking-wider text-muted-foreground">Amount (BDT)</label>
          <input
            type="number" min={0.2} step="0.01" value={amount}
            onChange={e => setAmount(Number(e.target.value))}
            className="mt-1 w-full rounded-md border border-input bg-background p-2 text-sm"
            required
          />
        </div>

        <div>
          <label className="block text-xs font-medium uppercase tracking-wider text-muted-foreground">Payment Method Target</label>
          <input
            value={method} onChange={e => setMethod(e.target.value)}
            className="mt-1 w-full rounded-md border border-input bg-background p-2 text-sm"
            placeholder="Visa | Master | Amex | Nexus"
            required
          />
          <p className="mt-1 text-xs text-muted-foreground">Provider page এ যে button-এ click করতে হবে তার label বা data attribute।</p>
        </div>

        <button
          disabled={busy || !providerId}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
        >
          {busy ? "Creating…" : "🧪 Create & Test"}
        </button>
      </form>

      {error && (
        <div className="mt-4 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {result && (
        <div className="mt-4 rounded-lg border border-emerald-500/40 bg-emerald-50 p-5 dark:bg-emerald-950/30">
          <h2 className="text-sm font-semibold text-emerald-700 dark:text-emerald-400">✅ Transaction created</h2>
          <dl className="mt-3 space-y-1 text-xs">
            <Row k="Session ID" v={result.apb_session_id} />
            <Row k="SMM Ref" v={result.smm_transaction_id} />
          </dl>
          <div className="mt-4 flex flex-wrap gap-2">
            <Link to="/checkout/$sessionId" params={{ sessionId: result.apb_session_id }} target="_blank"
              className="rounded-md bg-primary px-3 py-2 text-xs font-medium text-primary-foreground">
              Open Gateway Page →
            </Link>
            <Link to="/admin/transactions" className="rounded-md border border-border px-3 py-2 text-xs">
              View in Transactions
            </Link>
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            Worker online হলে কিছু সেকেন্ডের মধ্যে status <code>WORKER_PICKED → GATEWAY_READY</code> হবে।
            তারপর gateway page-এ EPS card form দেখাবে।
          </p>
        </div>
      )}
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex gap-2">
      <dt className="w-24 text-muted-foreground">{k}:</dt>
      <dd className="font-mono break-all">{v}</dd>
    </div>
  );
}
