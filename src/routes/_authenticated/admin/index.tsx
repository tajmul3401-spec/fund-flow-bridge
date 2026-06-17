// /admin - dashboard home
import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { bootstrapStatus, claimFirstAdmin, dashboardStats } from "@/lib/apb/admin.functions";

export const Route = createFileRoute("/_authenticated/admin/")({
  component: AdminHome,
});

function AdminHome() {
  const checkStatus = useServerFn(bootstrapStatus);
  const claim = useServerFn(claimFirstAdmin);
  const loadStats = useServerFn(dashboardStats);
  const [status, setStatus] = useState<{ has_any_admin: boolean; current_user_has_role: boolean } | null>(null);
  const [stats, setStats] = useState<{ total_24h: number; completed_24h: number; failed_24h: number; jobs_pending: number } | null>(null);
  const [claiming, setClaiming] = useState(false);

  useEffect(() => { checkStatus({}).then(setStatus).catch(() => {}); }, [checkStatus]);
  useEffect(() => { if (status?.current_user_has_role) loadStats({}).then(setStats).catch(() => {}); }, [status, loadStats]);

  if (!status) return <div className="p-8 text-muted-foreground">Loading…</div>;

  if (!status.has_any_admin) {
    return (
      <div className="p-8 max-w-xl">
        <h1 className="text-2xl font-semibold">Bootstrap admin</h1>
        <p className="mt-2 text-sm text-muted-foreground">No admin user exists yet. Claim this account as the first admin.</p>
        <button
          disabled={claiming}
          onClick={async () => { setClaiming(true); try { await claim({}); window.location.reload(); } catch (e) { alert(String(e)); setClaiming(false); } }}
          className="mt-4 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
        >
          {claiming ? "Claiming…" : "Make me admin"}
        </button>
      </div>
    );
  }

  if (!status.current_user_has_role) {
    return (
      <div className="p-8">
        <h1 className="text-2xl font-semibold">Not authorized</h1>
        <p className="mt-2 text-sm text-muted-foreground">Your account doesn't have admin access. Contact an existing admin.</p>
      </div>
    );
  }

  return (
    <div className="p-8">
      <h1 className="text-2xl font-semibold">Dashboard</h1>
      <p className="mt-1 text-sm text-muted-foreground">Last 24 hours</p>
      <div className="mt-6 grid grid-cols-2 gap-4 md:grid-cols-4">
        <Stat label="Transactions" value={stats?.total_24h ?? "—"} />
        <Stat label="Completed" value={stats?.completed_24h ?? "—"} accent="text-emerald-600" />
        <Stat label="Failed" value={stats?.failed_24h ?? "—"} accent="text-destructive" />
        <Stat label="Jobs pending" value={stats?.jobs_pending ?? "—"} />
      </div>
      <div className="mt-8 flex gap-3">
        <Link to="/admin/providers" className="rounded-md border border-border px-4 py-2 text-sm hover:bg-accent">Providers</Link>
        <Link to="/admin/clients" className="rounded-md border border-border px-4 py-2 text-sm hover:bg-accent">API Clients</Link>
        <Link to="/admin/workers" className="rounded-md border border-border px-4 py-2 text-sm hover:bg-accent">Workers</Link>
      </div>
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: number | string; accent?: string }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="text-xs uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={`mt-1 text-2xl font-semibold ${accent ?? ""}`}>{value}</div>
    </div>
  );
}
