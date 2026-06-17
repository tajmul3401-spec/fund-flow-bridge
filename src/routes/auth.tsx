import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/auth")({
  head: () => ({ meta: [{ title: "Sign in — APB Middleware" }, { name: "robots", content: "noindex" }] }),
  component: AuthPage,
});

function AuthPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [pwd, setPwd] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setErr(null); setBusy(true);
    try {
      const res = mode === "signin"
        ? await supabase.auth.signInWithPassword({ email, password: pwd })
        : await supabase.auth.signUp({ email, password: pwd, options: { emailRedirectTo: window.location.origin + "/admin" } });
      if (res.error) throw res.error;
      router.navigate({ to: "/admin" });
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-md rounded-xl border border-border bg-card p-8">
        <h1 className="text-xl font-semibold">APB Middleware Admin</h1>
        <p className="mt-1 text-sm text-muted-foreground">{mode === "signin" ? "Sign in to continue" : "Create your admin account"}</p>
        <form onSubmit={submit} className="mt-6 space-y-3">
          <input type="email" required value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" className="w-full rounded-md border border-input bg-background p-2 text-sm" />
          <input type="password" required minLength={8} value={pwd} onChange={e => setPwd(e.target.value)} placeholder="Password (min 8 chars)" className="w-full rounded-md border border-input bg-background p-2 text-sm" />
          {err && <p className="text-xs text-destructive">{err}</p>}
          <button disabled={busy} className="w-full rounded-md bg-primary py-2 text-sm font-medium text-primary-foreground disabled:opacity-50">{busy ? "…" : (mode === "signin" ? "Sign in" : "Sign up")}</button>
        </form>
        <button onClick={() => setMode(m => m === "signin" ? "signup" : "signin")} className="mt-4 w-full text-xs text-muted-foreground underline">
          {mode === "signin" ? "Need an account? Sign up" : "Have an account? Sign in"}
        </button>
      </div>
    </div>
  );
}
