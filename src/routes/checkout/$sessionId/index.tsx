// Public gateway page. Polls status; when checkout_url is ready, redirects (top-level)
// to the provider's payment page. Brand-masked: shows the SMM panel's brand, not the provider.
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";

export const Route = createFileRoute("/checkout/$sessionId")({
  head: () => ({
    meta: [
      { title: "Payment Gateway" },
      { name: "robots", content: "noindex, nofollow" },
      { name: "referrer", content: "no-referrer" },
    ],
  }),
  component: GatewayPage,
});

type Status = {
  status: string;
  checkout_url: string | null;
  error_message: string | null;
  brand_name: string;
  brand_logo_url: string | null;
};

function GatewayPage() {
  const { sessionId } = Route.useParams();
  const [data, setData] = useState<Status | null>(null);
  const [polls, setPolls] = useState(0);

  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    async function tick() {
      try {
        const res = await fetch(`/checkout/${sessionId}/api/poll`);
        if (res.ok) {
          const j = (await res.json()) as Status;
          if (!stopped) {
            setData(j);
            if (j.checkout_url && (j.status === "CHECKOUT_READY" || j.status === "REDIRECTED")) {
              await fetch(`/checkout/${sessionId}/api/mark-redirected`, { method: "POST" });
              window.location.replace(j.checkout_url);
              return;
            }
            if (j.status === "FAILED" || j.status === "CANCELLED") return;
          }
        }
      } catch { /* swallow */ }
      setPolls(p => p + 1);
      if (!stopped) timer = setTimeout(tick, 1500);
    }
    tick();
    return () => { stopped = true; clearTimeout(timer); };
  }, [sessionId]);

  const failed = data?.status === "FAILED" || data?.status === "CANCELLED";

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-md rounded-xl border border-border bg-card p-8 shadow-sm text-center">
        {data?.brand_logo_url && (
          <img src={data.brand_logo_url} alt={data.brand_name} className="mx-auto mb-4 h-12" />
        )}
        <h1 className="text-xl font-semibold text-foreground">{data?.brand_name ?? "Secure Payment"}</h1>

        {!failed && (
          <>
            <div className="my-8 flex justify-center">
              <div className="h-10 w-10 animate-spin rounded-full border-4 border-muted border-t-primary" />
            </div>
            <p className="text-sm text-muted-foreground">
              Preparing your secure checkout&hellip;
            </p>
            <p className="mt-2 text-xs text-muted-foreground">
              You will be redirected to the payment page in a moment.
            </p>
            {polls > 12 && (
              <p className="mt-4 text-xs text-muted-foreground">
                Taking longer than usual. Please don't close this window.
              </p>
            )}
          </>
        )}

        {failed && (
          <div className="mt-6">
            <p className="text-sm font-medium text-destructive">Payment session failed</p>
            <p className="mt-2 text-xs text-muted-foreground">
              {data?.error_message ?? "Please try again or contact support."}
            </p>
          </div>
        )}

        <p className="mt-8 text-[10px] uppercase tracking-wider text-muted-foreground">
          Session {sessionId.slice(-8)}
        </p>
      </div>
    </div>
  );
}
