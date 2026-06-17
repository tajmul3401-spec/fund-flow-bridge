import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { listApiClients, createApiClient, updateApiClient, rotateApiKey, deleteApiClient, listProviders } from "@/lib/apb/admin.functions";

export const Route = createFileRoute("/_authenticated/admin/clients")({ component: ClientsPage });

type Row = {
  id: string; name: string; brand_name: string; brand_logo_url: string | null;
  webhook_url: string; return_url: string; default_provider_id: string | null;
  rate_limit_per_min: number; enabled: boolean; api_key_prefix: string;
};

function ClientsPage() {
  const list = useServerFn(listApiClients);
  const create = useServerFn(createApiClient);
  const update = useServerFn(updateApiClient);
  const rotate = useServerFn(rotateApiKey);
  const del = useServerFn(deleteApiClient);
  const lp = useServerFn(listProviders);

  const [rows, setRows] = useState<Row[]>([]);
  const [providers, setProviders] = useState<{ id: string; name: string }[]>([]);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Row | null>(null);
  const [credentials, setCredentials] = useState<{ api_key: string; hmac_secret?: string } | null>(null);

  const reload = () => list({}).then(d => setRows(d as Row[]));
  useEffect(() => { reload(); lp({}).then(d => setProviders(d as { id: string; name: string }[])); }, []);

  return (
    <div className="p-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">API Clients (SMM Panels)</h1>
        <button onClick={() => setCreating(true)} className="rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground">+ New Client</button>
      </div>

      <div className="mt-6 overflow-x-auto rounded-lg border border-border">
        <table className="w-full text-sm">
          <thead className="bg-muted text-left text-xs uppercase tracking-wider text-muted-foreground">
            <tr><th className="p-3">Name</th><th className="p-3">Brand</th><th className="p-3">API Key Prefix</th><th className="p-3">Webhook</th><th className="p-3">Status</th><th className="p-3"></th></tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.id} className="border-t border-border">
                <td className="p-3 font-medium">{r.name}</td>
                <td className="p-3">{r.brand_name}</td>
                <td className="p-3 font-mono text-xs">{r.api_key_prefix}…</td>
                <td className="p-3 text-muted-foreground truncate max-w-xs">{r.webhook_url}</td>
                <td className="p-3">{r.enabled ? <span className="text-emerald-600">enabled</span> : <span className="text-muted-foreground">disabled</span>}</td>
                <td className="p-3 text-right whitespace-nowrap">
                  <button onClick={() => setEditing(r)} className="text-xs underline">edit</button>
                  <button onClick={async () => { if (confirm("Rotate API key? Old key stops working.")) { const r2 = await rotate({ data: { id: r.id } }); setCredentials({ api_key: r2.api_key }); reload(); } }} className="ml-3 text-xs underline">rotate key</button>
                  <button onClick={async () => { if (confirm("Delete client?")) { await del({ data: { id: r.id } }); reload(); } }} className="ml-3 text-xs text-destructive underline">delete</button>
                </td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={6} className="p-8 text-center text-muted-foreground">No clients yet</td></tr>}
          </tbody>
        </table>
      </div>

      {(creating || editing) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-lg rounded-lg bg-card p-6">
            <h2 className="text-lg font-semibold">{editing ? "Edit" : "New"} API Client</h2>
            <form className="mt-4 space-y-3" onSubmit={async e => {
              e.preventDefault();
              const fd = new FormData(e.currentTarget);
              const payload = {
                name: String(fd.get("name")),
                brand_name: String(fd.get("brand_name")),
                brand_logo_url: String(fd.get("brand_logo_url") || ""),
                webhook_url: String(fd.get("webhook_url")),
                return_url: String(fd.get("return_url")),
                default_provider_id: String(fd.get("default_provider_id") || ""),
                rate_limit_per_min: Number(fd.get("rate_limit_per_min") || 60),
                enabled: fd.get("enabled") === "on",
              };
              try {
                if (editing) { await update({ data: { id: editing.id, ...payload } }); setEditing(null); }
                else { const r = await create({ data: payload }); setCredentials({ api_key: r.api_key, hmac_secret: r.hmac_secret }); setCreating(false); }
                reload();
              } catch (err) { alert(String(err)); }
            }}>
              <Field name="name" label="Internal name" defaultValue={editing?.name ?? ""} required />
              <Field name="brand_name" label="Brand name (shown to end users)" defaultValue={editing?.brand_name ?? ""} required />
              <Field name="brand_logo_url" label="Brand logo URL" defaultValue={editing?.brand_logo_url ?? ""} />
              <Field name="webhook_url" label="Webhook URL (receives event POSTs)" defaultValue={editing?.webhook_url ?? ""} required />
              <Field name="return_url" label="Return URL (user redirected here after payment)" defaultValue={editing?.return_url ?? ""} required />
              <div>
                <label className="text-xs uppercase tracking-wider text-muted-foreground">Default provider</label>
                <select name="default_provider_id" defaultValue={editing?.default_provider_id ?? ""} className="mt-1 w-full rounded-md border border-input bg-background p-2 text-sm">
                  <option value="">— none —</option>
                  {providers.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
              <Field name="rate_limit_per_min" label="Rate limit (req/min)" type="number" defaultValue={String(editing?.rate_limit_per_min ?? 60)} />
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="enabled" defaultChecked={editing?.enabled ?? true} /> Enabled</label>
              <div className="flex justify-end gap-2 pt-3">
                <button type="button" onClick={() => { setCreating(false); setEditing(null); }} className="rounded-md border px-3 py-2 text-sm">Cancel</button>
                <button type="submit" className="rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground">Save</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {credentials && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-lg rounded-lg bg-card p-6">
            <h2 className="text-lg font-semibold">⚠️ Save these credentials now</h2>
            <p className="mt-1 text-sm text-muted-foreground">They will not be shown again.</p>
            <div className="mt-4">
              <label className="text-xs uppercase tracking-wider text-muted-foreground">API Key</label>
              <pre className="mt-1 break-all rounded-md bg-muted p-3 font-mono text-xs">{credentials.api_key}</pre>
            </div>
            {credentials.hmac_secret && (
              <div className="mt-4">
                <label className="text-xs uppercase tracking-wider text-muted-foreground">HMAC Webhook Secret</label>
                <pre className="mt-1 break-all rounded-md bg-muted p-3 font-mono text-xs">{credentials.hmac_secret}</pre>
              </div>
            )}
            <div className="mt-4 text-right">
              <button onClick={() => setCredentials(null)} className="rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground">I've saved them</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Field({ name, label, ...rest }: { name: string; label: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div>
      <label className="text-xs uppercase tracking-wider text-muted-foreground">{label}</label>
      <input name={name} className="mt-1 w-full rounded-md border border-input bg-background p-2 text-sm" {...rest} />
    </div>
  );
}
