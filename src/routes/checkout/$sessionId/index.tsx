// Public gateway page. Polls status; when checkout_url is ready, embeds the
// provider's payment page inside an iframe so the user NEVER sees the
// underlying provider domain (e.g. bestfollows.com). If the gateway iframe
// navigates away from its initial URL (success OR cancel), we treat the
// session as finished and bounce the user to the merchant's return URL.
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";

export const Route = createFileRoute("/checkout/$sessionId/")({
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
  return_url?: string | null;
};

function GatewayPage() {
  const { sessionId } = Route.useParams();
  const [data, setData] = useState<Status | null>(null);
  const [polls, setPolls] = useState(0);
  const [iframeLoads, setIframeLoads] = useState(0);
  const [finishing, setFinishing] = useState(false);
  const [countdown, setCountdown] = useState(10);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const markedRedirectedRef = useRef(false);

  // 10-second countdown shown while preparing checkout
  useEffect(() => {
    if (data?.checkout_url || finishing) return;
    if (countdown <= 0) return;
    const t = setTimeout(() => setCountdown(c => c - 1), 1000);
    return () => clearTimeout(t);
  }, [countdown, data?.checkout_url, finishing]);

  // Poll status until checkout_url is ready
  useEffect(() => {
    if (data?.checkout_url) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    async function tick() {
      try {
        const res = await fetch(`/checkout/${sessionId}/api/poll`);
        if (res.ok) {
          const j = (await res.json()) as Status;
          if (!stopped) {
            setData(j);
            if (j.checkout_url) return; // stop polling, iframe takes over
            if (j.status === "FAILED" || j.status === "CANCELLED") return;
          }
        }
      } catch { /* swallow */ }
      setPolls(p => p + 1);
      if (!stopped) timer = setTimeout(tick, 1500);
    }
    tick();
    return () => { stopped = true; clearTimeout(timer); };
  }, [sessionId, data?.checkout_url]);

  // When iframe loads more than once, the user has either paid or cancelled
  // (gateway navigated to its own success/cancel URL). Finish the session.
  useEffect(() => {
    if (iframeLoads < 2 || finishing) return;
    setFinishing(true);
    (async () => {
      try {
        // Wait briefly so a true success callback can mark the txn COMPLETED
        await new Promise(r => setTimeout(r, 1500));
        const res = await fetch(`/checkout/${sessionId}/api/poll`);
        const j = res.ok ? ((await res.json()) as Status) : null;
        const status = j?.status ?? "CANCELLED";
        const ret = data?.return_url;
        const target = ret
          ? `${ret}${ret.includes("?") ? "&" : "?"}apb_session_id=${sessionId}&status=${status}`
          : "/";
        window.location.replace(target);
      } catch {
        window.location.replace("/");
      }
    })();
  }, [iframeLoads, finishing, sessionId, data?.return_url]);

  const handleIframeLoad = () => {
    if (!markedRedirectedRef.current && data?.checkout_url) {
      markedRedirectedRef.current = true;
      fetch(`/checkout/${sessionId}/api/mark-redirected`, { method: "POST" }).catch(() => {});
    }
    setIframeLoads(n => n + 1);
  };

  const failed = data?.status === "FAILED" || data?.status === "CANCELLED";

  // Once checkout_url is available, render full-screen branded iframe
  if (data?.checkout_url && !failed && !finishing) {
    return (
      <div className="fixed inset-0 flex flex-col bg-background">
        <div className="flex items-center justify-between border-b border-border bg-card px-4 py-2">
          <div className="flex items-center gap-2">
            {data.brand_logo_url && (
              <img src={data.brand_logo_url} alt={data.brand_name} className="h-6" />
            )}
            <span className="text-sm font-medium text-foreground">{data.brand_name}</span>
          </div>
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
            Secure · {sessionId.slice(-8)}
          </span>
        </div>
        <iframe
          ref={iframeRef}
          src={data.checkout_url}
          onLoad={handleIframeLoad}
          title="Secure payment"
          className="flex-1 w-full border-0 bg-white"
          allow="payment *; clipboard-write"
          referrerPolicy="no-referrer"
          sandbox="allow-forms allow-scripts allow-same-origin allow-popups allow-top-navigation-by-user-activation"
        />
      </div>
    );
  }

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
              {finishing ? (
                <div className="h-10 w-10 animate-spin rounded-full border-4 border-muted border-t-primary" />
              ) : (
                <div className="flex h-24 w-24 items-center justify-center rounded-full border-4 border-primary/20">
                  <span className="text-3xl font-semibold tabular-nums text-primary">
                    {countdown}
                  </span>
                </div>
              )}
            </div>
            <p className="text-sm text-muted-foreground">
              {finishing ? "Finalizing your payment…" : "Preparing your secure checkout…"}
            </p>
            <p className="mt-2 text-xs text-muted-foreground">
              Please don't close this window.
            </p>
            {countdown === 0 && !finishing && (
              <p className="mt-4 text-xs text-muted-foreground">
                Taking longer than usual… ({polls} checks)
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
