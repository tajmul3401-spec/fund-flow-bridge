import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { listProviders, upsertProvider, deleteProvider } from "@/lib/apb/admin.functions";

export const Route = createFileRoute("/_authenticated/admin/providers")({ component: ProvidersPage });

type Provider = { id: string; name: string; base_url: string; currency: string; exchange_rate: number; enabled: boolean; notes: string | null; flow_config: Record<string, unknown> };

function ProvidersPage() {
  const list = useServerFn(listProviders);
  const upsert = useServerFn(upsertProvider);
  const del = useServerFn(deleteProvider);
  const [rows, setRows] = useState<Provider[]>([]);
  const [editing, setEditing] = useState<Partial<Provider> & { username?: string; password?: string } | null>(null);

  const reload = () => list({}).then(d => setRows(d as Provider[]));
  useEffect(() => { reload(); }, []);

  return (
    <div className="p-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Providers</h1>
        <button onClick={() => setEditing({ enabled: true, currency: "BDT", exchange_rate: 1, flow_config: {} })} className="rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground">+ New Provider</button>
      </div>
      <div className="mt-6 overflow-x-auto rounded-lg border border-border">
        <table className="w-full text-sm">
          <thead className="bg-muted text-left text-xs uppercase tracking-wider text-muted-foreground">
            <tr><th className="p-3">Name</th><th className="p-3">URL</th><th className="p-3">Currency</th><th className="p-3">Rate</th><th className="p-3">Status</th><th className="p-3"></th></tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.id} className="border-t border-border">
                <td className="p-3 font-medium">{r.name}</td>
                <td className="p-3 text-muted-foreground">{r.base_url}</td>
                <td className="p-3">{r.currency}</td>
                <td className="p-3">{r.exchange_rate}</td>
                <td className="p-3">{r.enabled ? <span className="text-emerald-600">enabled</span> : <span className="text-muted-foreground">disabled</span>}</td>
                <td className="p-3 text-right">
                  <button onClick={() => setEditing({ ...r, username: "", password: "" })} className="text-xs underline">edit</button>
                  <button onClick={async () => { if (confirm("Delete?")) { await del({ data: { id: r.id } }); reload(); } }} className="ml-3 text-xs text-destructive underline">delete</button>
                </td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={6} className="p-8 text-center text-muted-foreground">No providers yet</td></tr>}
          </tbody>
        </table>
      </div>

      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-lg rounded-lg bg-card p-6">
            <h2 className="text-lg font-semibold">{editing.id ? "Edit" : "New"} Provider</h2>
            <form className="mt-4 space-y-3" onSubmit={async e => {
              e.preventDefault();
              const f = e.currentTarget as HTMLFormElement;
              const fd = new FormData(f);
              try {
                await upsert({
                  data: {
                    id: editing.id,
                    name: String(fd.get("name")),
                    base_url: String(fd.get("base_url")),
                    username: String(fd.get("username") || ""),
                    password: String(fd.get("password") || ""),
                    flow_config: JSON.parse(String(fd.get("flow_config") || "{}")),
                    currency: String(fd.get("currency") || "BDT"),
                    exchange_rate: Number(fd.get("exchange_rate") || 1),
                    enabled: fd.get("enabled") === "on",
                    notes: String(fd.get("notes") || ""),
                  },
                });
                setEditing(null); reload();
              } catch (err) { alert(String(err)); }
            }}>
              <Field name="name" label="Name" defaultValue={editing.name ?? ""} />
              <Field name="base_url" label="Base URL" defaultValue={editing.base_url ?? ""} placeholder="https://provider-panel.com" />
              <Field name="username" label="Provider login username" defaultValue="" required={!editing.id} placeholder={editing.id ? "(unchanged unless you fill)" : ""} />
              <Field name="password" label="Provider login password" type="password" defaultValue="" required={!editing.id} placeholder={editing.id ? "(unchanged unless you fill)" : ""} />
              <div className="grid grid-cols-2 gap-3">
                <Field name="currency" label="Provider currency" defaultValue={editing.currency ?? "BDT"} />
                <Field name="exchange_rate" label="Exchange rate (client→provider)" type="number" step="0.0001" defaultValue={String(editing.exchange_rate ?? 1)} />
              </div>
              <div>
                <label className="text-xs uppercase tracking-wider text-muted-foreground">Flow config (JSON)</label>
                <textarea name="flow_config" defaultValue={JSON.stringify(editing.flow_config ?? {}, null, 2)} className="mt-1 w-full rounded-md border border-input bg-background p-2 font-mono text-xs" rows={5} />
              </div>
              <Field name="notes" label="Notes" defaultValue={editing.notes ?? ""} />
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="enabled" defaultChecked={editing.enabled ?? true} /> Enabled</label>
              <div className="flex justify-end gap-2 pt-3">
                <button type="button" onClick={() => setEditing(null)} className="rounded-md border px-3 py-2 text-sm">Cancel</button>
                <button type="submit" className="rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground">Save</button>
              </div>
            </form>
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
