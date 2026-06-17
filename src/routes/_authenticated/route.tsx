// Integration-managed auth gate (client-side auth check, redirects to /auth).
import { createFileRoute, Outlet, redirect, Link, useRouter } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { LayoutDashboard, Server, Users, Receipt, Cpu, BookOpen, LogOut, FlaskConical } from "lucide-react";

export const Route = createFileRoute("/_authenticated")({
  beforeLoad: async () => {
    if (typeof window === "undefined") return;
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/auth" });
    return { user: data.user };
  },
  component: AuthedLayout,
});

function AuthedLayout() {
  const router = useRouter();
  async function signOut() {
    await supabase.auth.signOut();
    router.navigate({ to: "/auth", replace: true });
  }
  return (
    <div className="flex min-h-screen bg-background">
      <aside className="w-60 shrink-0 border-r border-border bg-sidebar p-4">
        <div className="mb-6 px-2">
          <div className="text-sm font-semibold text-sidebar-foreground">APB Middleware</div>
          <div className="text-xs text-muted-foreground">Admin Console</div>
        </div>
        <nav className="space-y-1 text-sm">
          <NavItem to="/admin" icon={LayoutDashboard} label="Dashboard" />
          <NavItem to="/admin/providers" icon={Server} label="Providers" />
          <NavItem to="/admin/clients" icon={Users} label="API Clients" />
          <NavItem to="/admin/transactions" icon={Receipt} label="Transactions" />
          <NavItem to="/admin/workers" icon={Cpu} label="Workers" />
          <NavItem to="/admin/test" icon={FlaskConical} label="Test Transaction" />
          <a href="/docs" target="_blank" className="flex items-center gap-2 rounded-md px-3 py-2 text-sidebar-foreground hover:bg-sidebar-accent">
            <BookOpen className="h-4 w-4" /> API Docs
          </a>
        </nav>
        <button onClick={signOut} className="mt-6 flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-sidebar-foreground hover:bg-sidebar-accent">
          <LogOut className="h-4 w-4" /> Sign out
        </button>
      </aside>
      <main className="flex-1 overflow-auto"><Outlet /></main>
    </div>
  );
}

function NavItem({ to, icon: Icon, label }: { to: string; icon: React.ComponentType<{ className?: string }>; label: string }) {
  return (
    <Link to={to} className="flex items-center gap-2 rounded-md px-3 py-2 text-sidebar-foreground hover:bg-sidebar-accent [&.active]:bg-sidebar-accent [&.active]:text-sidebar-accent-foreground" activeProps={{ className: "active" }}>
      <Icon className="h-4 w-4" /> {label}
    </Link>
  );
}
