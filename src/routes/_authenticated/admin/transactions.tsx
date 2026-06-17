import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { listTransactions } from "@/lib/apb/admin.functions";

export const Route = createFileRoute("/_authenticated/admin/transactions")({ component: TxnsPage });

type Txn = {
  id: string; apb_session_id: string; smm_transaction_id: string; client_user_id: string;
  amount: number; currency: string; payment_method_target: string; status: string;
  checkout_url: string | null; error_message: string | null; created_at: string;
};

function TxnsPage() {
  const list = useServerFn(listTransactions);
  const [rows, setRows] = useState<Txn[]>([]);
  const [status, setStatus] = useState<string>("");

  useEffect(() => { list({ data: status ? { status } : {} }).then(d => setRows(d as Txn[])); }, [list, status]);

  return (
    <div className="p-8">
      <h1 className="text-2xl font-semibold">Transactions</h1>
      <div className="mt-3 flex gap-2 text-xs">
        {["", "INITIALIZED", "CHECKOUT_READY", "REDIRECTED", "COMPLETED", "FAILED", "PENDING_MANUAL_AUDIT"].map(s => (
          <button key={s} onClick={() => setStatus(s)} className={`rounded-full border px-3 py-1 ${status === s ? "bg-primary text-primary-foreground" : ""}`}>{s || "All"}</button>
        ))}
      </div>
      <div className="mt-6 overflow-x-auto rounded-lg border border-border">
        <table className="w-full text-sm">
          <thead className="bg-muted text-left text-xs uppercase tracking-wider text-muted-foreground">
            <tr><th className="p-3">Session</th><th className="p-3">SMM Ref</th><th className="p-3">User</th><th className="p-3">Amount</th><th className="p-3">Method</th><th className="p-3">Status</th><th className="p-3">Created</th></tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.id} className="border-t border-border">
                <td className="p-3 font-mono text-xs">{r.apb_session_id.slice(-12)}</td>
                <td className="p-3">{r.smm_transaction_id}</td>
                <td className="p-3 text-muted-foreground">{r.client_user_id}</td>
                <td className="p-3">{r.amount} {r.currency}</td>
                <td className="p-3">{r.payment_method_target}</td>
                <td className="p-3"><StatusBadge s={r.status} /></td>
                <td className="p-3 text-xs text-muted-foreground">{new Date(r.created_at).toLocaleString()}</td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={7} className="p-8 text-center text-muted-foreground">No transactions</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function StatusBadge({ s }: { s: string }) {
  const color =
    s === "COMPLETED" ? "bg-emerald-100 text-emerald-700" :
    s === "FAILED" || s === "CANCELLED" ? "bg-red-100 text-red-700" :
    s === "PENDING_MANUAL_AUDIT" ? "bg-amber-100 text-amber-700" :
    "bg-blue-100 text-blue-700";
  return <span className={`rounded-full px-2 py-0.5 text-xs ${color}`}>{s}</span>;
}
