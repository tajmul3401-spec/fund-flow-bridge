import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { listWorkers, createWorker, deleteWorker } from "@/lib/apb/admin.functions";

export const Route = createFileRoute("/_authenticated/admin/workers")({ component: WorkersPage });

type W = { id: string; name: string; enabled: boolean; last_seen_at: string | null; last_ip: string | null; created_at: string };

function WorkersPage() {
  const list = useServerFn(listWorkers);
  const create = useServerFn(createWorker);
  const del = useServerFn(deleteWorker);
  const [rows, setRows] = useState<W[]>([]);
  const [name, setName] = useState("");
  const [token, setToken] = useState<string | null>(null);

  const reload = () => list({}).then(d => setRows(d as W[]));
  useEffect(() => { reload(); }, []);

  return (
    <div className="p-8">
      <h1 className="text-2xl font-semibold">Automation Workers</h1>
      <p className="mt-1 text-sm text-muted-foreground">Each worker holds one token. Deploy the <code className="text-xs">automation-worker/</code> service with the token as <code className="text-xs">APB_WORKER_TOKEN</code>.</p>

      <form className="mt-6 flex gap-2" onSubmit={async e => {
        e.preventDefault();
        if (!name.trim()) return;
        const r = await create({ data: { name: name.trim() } });
        setToken(r.worker_token);
        setName("");
        reload();
      }}>
        <input value={name} onChange={e => setName(e.target.value)} placeholder="Worker name e.g. vps-bd-1" className="flex-1 rounded-md border border-input bg-background p-2 text-sm" />
        <button className="rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground">+ Create worker</button>
      </form>

      <div className="mt-6 overflow-x-auto rounded-lg border border-border">
        <table className="w-full text-sm">
          <thead className="bg-muted text-left text-xs uppercase tracking-wider text-muted-foreground">
            <tr><th className="p-3">Name</th><th className="p-3">Last seen</th><th className="p-3">IP</th><th className="p-3">Status</th><th className="p-3"></th></tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.id} className="border-t border-border">
                <td className="p-3 font-medium">{r.name}</td>
                <td className="p-3 text-xs text-muted-foreground">{r.last_seen_at ? new Date(r.last_seen_at).toLocaleString() : "never"}</td>
                <td className="p-3 text-xs text-muted-foreground">{r.last_ip ?? "—"}</td>
                <td className="p-3">{r.enabled ? <span className="text-emerald-600">enabled</span> : <span className="text-muted-foreground">disabled</span>}</td>
                <td className="p-3 text-right"><button onClick={async () => { if (confirm("Delete worker?")) { await del({ data: { id: r.id } }); reload(); } }} className="text-xs text-destructive underline">delete</button></td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={5} className="p-8 text-center text-muted-foreground">No workers yet</td></tr>}
          </tbody>
        </table>
      </div>

      {token && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-lg rounded-lg bg-card p-6">
            <h2 className="text-lg font-semibold">⚠️ Save this worker token now</h2>
            <p className="mt-1 text-sm text-muted-foreground">Use as APB_WORKER_TOKEN. Not shown again.</p>
            <pre className="mt-3 break-all rounded-md bg-muted p-3 font-mono text-xs">{token}</pre>
            <div className="mt-4 text-right"><button onClick={() => setToken(null)} className="rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground">Done</button></div>
          </div>
        </div>
      )}
    </div>
  );
}
