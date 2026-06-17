import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "APB Middleware — Automated Payment Bridge for SMM Panels" },
      { name: "description", content: "Connect your SMM panel's add-fund flow to provider payment gateways with zero manual steps." },
    ],
  }),
  component: Landing,
});

function Landing() {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-5xl items-center justify-between p-4">
          <div className="text-sm font-semibold">APB Middleware</div>
          <nav className="flex gap-4 text-sm">
            <Link to="/docs" className="text-muted-foreground hover:text-foreground">API Docs</Link>
            <Link to="/admin" className="text-muted-foreground hover:text-foreground">Admin</Link>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-6 py-20">
        <h1 className="text-4xl font-bold tracking-tight md:text-5xl">Automated Payment Bridge for SMM panels</h1>
        <p className="mt-4 max-w-2xl text-lg text-muted-foreground">
          Your users hit "Add Funds" → our automation logs into your provider panel, navigates the BD payment flow, captures the gateway URL, and hands it back to your user in under 3 seconds. Brand-masked, signed webhooks, full audit trail.
        </p>
        <div className="mt-8 flex gap-3">
          <Link to="/admin" className="rounded-md bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground">Open Admin Console</Link>
          <Link to="/docs" className="rounded-md border border-border px-5 py-2.5 text-sm font-medium">Read the API docs</Link>
        </div>
        <div className="mt-16 grid gap-6 md:grid-cols-3">
          <Card title="REST + Webhooks" body="POST /checkout/initialize → get a gateway URL. Signed webhook on every state change." />
          <Card title="Playwright worker" body="External Node worker logs into your provider, handles selectors, retries silently." />
          <Card title="Multi-tenant" body="One installation, many SMM panels. Each panel has its own brand, webhook URL, and API key." />
        </div>
      </main>
    </div>
  );
}

function Card({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-lg border border-border bg-card p-5">
      <div className="font-semibold">{title}</div>
      <div className="mt-2 text-sm text-muted-foreground">{body}</div>
    </div>
  );
}
