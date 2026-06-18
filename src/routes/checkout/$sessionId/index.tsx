// Public gateway page. Polls status; once checkout_url is ready, the user
// clicks "Continue to Payment" which opens the provider gateway in a NEW
// TAB (top-level, so X-Frame-Options can't block it). This tab becomes a
// watcher: it polls status and, on any terminal status (COMPLETED, FAILED,
// CANCELLED, PENDING_MANUAL_AUDIT), redirects the user to the merchant's
// return_url — so the user NEVER lands on bestfollows / EPS pages whether
// they pay or cancel.
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

const TERMINAL = new Set(["COMPLETED", "FAILED", "CANCELLED", "PENDING_MANUAL_AUDIT"]);

function GatewayPage() {
  const { sessionId } = Route.useParams();
  const [data, setData] = useState<Status | null>(null);
  const [polls, setPolls] = useState(0);
  const [countdown, setCountdown] = useState(10);
  const [finishing, setFinishing] = useState(false);
  const [opened, setOpened] = useState(false);
  const popupRef = useRef<Window | null>(null);
  const markedRedirectedRef = useRef(false);
  const finishingRef = useRef(false);

  // 10s countdown while waiting for checkout_url
  useEffect(() => {
    if (data?.checkout_url || finishing) return;
    if (countdown <= 0) return;
    const t = setTimeout(() => setCountdown(c => c - 1), 1000);
    return () => clearTimeout(t);
  }, [countdown, data?.checkout_url, finishing]);

  // Continuous poll — fetches initial status and keeps watching after the
  // payment tab opens so we can react to COMPLETED/FAILED/CANCELLED.
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
            if (TERMINAL.has(j.status) && !finishingRef.current) {
              finishingRef.current = true;
              redirectBackToMerchant(j);
              return;
            }
          }
        }
      } catch { /* swallow */ }
      setPolls(p => p + 1);
      if (!stopped) timer = setTimeout(tick, 1500);
    }
    tick();
    return () => { stopped = true; clearTimeout(timer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  // If the payment popup closes (user crossed it, EPS redirected it to
  // bestfollows, or browser killed it), give a short grace for the webhook
  // to land, then force-finalize so the user is bounced back to the
  // merchant — never left on bestfollows / EPS.
  useEffect(() => {
    if (!opened) return;
    const interval = setInterval(() => {
      if (popupRef.current && popupRef.current.closed) {
        clearInterval(interval);
        // 4s grace → enough for EPS webhook to flip status to COMPLETED.
        // If still non-terminal, we mark CANCELLED and redirect.
        setTimeout(() => {
          if (!finishingRef.current) cancelAndExit();
        }, 4_000);
      }
    }, 500);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opened]);

  // (Cross-origin probe removed — the EPS gateway itself is cross-origin
  // from us, so probing closes the popup the instant it opens.)

  function redirectBackToMerchant(j: Status | null) {
    setFinishing(true);
    const status = j?.status ?? "CANCELLED";
    const ret = (j ?? data)?.return_url;
    const target = ret
      ? `${ret}${ret.includes("?") ? "&" : "?"}apb_session_id=${sessionId}&status=${status}`
      : "/";
    try { popupRef.current?.close(); } catch { /* cross-origin, ignore */ }
    window.location.replace(target);
  }

  async function cancelAndExit() {
    if (finishingRef.current) return;
    finishingRef.current = true;
    setFinishing(true);
    try {
      await fetch(`/checkout/${sessionId}/api/cancel`, { method: "POST" }).catch(() => {});
      const res = await fetch(`/checkout/${sessionId}/api/poll`);
      const j = res.ok ? ((await res.json()) as Status) : null;
      redirectBackToMerchant(j);
    } catch {
      redirectBackToMerchant(null);
    }
  }

  function openPayment() {
    if (!data?.checkout_url) return;
    const w = window.open(data.checkout_url, "apb_pay", "noopener=no,noreferrer=no");
    popupRef.current = w;
    setOpened(true);
    if (!markedRedirectedRef.current) {
      markedRedirectedRef.current = true;
      fetch(`/checkout/${sessionId}/api/mark-redirected`, { method: "POST" }).catch(() => {});
    }
    if (!w) {
      // Popup blocked — fall back to same-tab navigation (last resort).
      // User loses the watcher, but the merchant return_url is still where
      // they'll end up after the provider redirects.
      window.location.href = data.checkout_url;
    }
  }

  const failed = data?.status === "FAILED" || data?.status === "CANCELLED";
  const ready = !!data?.checkout_url && !failed;

  return (
    <div className="min-h-screen flex flex-col bg-background">
      {/* Brand header — always shown so the user sees our domain */}
      <div className="flex items-center justify-between border-b border-border bg-card px-4 py-3">
        <div className="flex items-center gap-2">
          {data?.brand_logo_url && (
            <img src={data.brand_logo_url} alt={data.brand_name} className="h-6" />
          )}
          <span className="text-sm font-semibold text-foreground">
            {data?.brand_name ?? "Secure Payment"}
          </span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
            Secure · {sessionId.slice(-8)}
          </span>
          {ready && !finishing && (
            <button
              type="button"
              onClick={() => {
                if (confirm("Cancel this payment and return to the merchant?")) {
                  cancelAndExit();
                }
              }}
              className="rounded-md border border-border bg-background px-3 py-1 text-xs font-medium text-foreground hover:bg-muted"
            >
              Cancel Payment
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 flex items-center justify-center px-4 py-10">
        <div className="w-full max-w-md rounded-xl border border-border bg-card p-8 shadow-sm text-center">

          {/* State 1 — waiting for checkout_url */}
          {!ready && !failed && !finishing && (
            <>
              <div className="my-6 flex justify-center">
                <div className="flex h-24 w-24 items-center justify-center rounded-full border-4 border-primary/20">
                  <span className="text-3xl font-semibold tabular-nums text-primary">
                    {countdown}
                  </span>
                </div>
              </div>
              <p className="text-sm text-muted-foreground">Preparing your secure checkout…</p>
              <p className="mt-2 text-xs text-muted-foreground">Please don't close this window.</p>
              {countdown === 0 && (
                <p className="mt-4 text-xs text-muted-foreground">
                  Taking longer than usual… ({polls} checks)
                </p>
              )}
            </>
          )}

          {/* State 2 — ready, prompt to open payment */}
          {ready && !opened && !finishing && (
            <>
              <h1 className="text-lg font-semibold text-foreground">Ready to pay</h1>
              <p className="mt-2 text-sm text-muted-foreground">
                Click the button below to open the secure payment window.
              </p>
              <button
                type="button"
                onClick={openPayment}
                className="mt-6 inline-flex h-11 w-full items-center justify-center rounded-md bg-primary px-6 text-sm font-semibold text-primary-foreground shadow-sm hover:bg-primary/90"
              >
                Continue to Payment →
              </button>
              <p className="mt-4 text-[11px] text-muted-foreground">
                A new tab will open. Keep this window open — we'll bring you back here automatically when payment is complete.
              </p>
            </>
          )}

          {/* State 3 — payment tab is open, watching */}
          {ready && opened && !finishing && (
            <>
              <div className="my-6 flex justify-center">
                <div className="h-12 w-12 animate-spin rounded-full border-4 border-muted border-t-primary" />
              </div>
              <h1 className="text-base font-semibold text-foreground">Waiting for payment…</h1>
              <p className="mt-2 text-sm text-muted-foreground">
                Complete the payment in the other tab. This page will update automatically.
              </p>
              <button
                type="button"
                onClick={openPayment}
                className="mt-6 text-xs text-primary underline-offset-2 hover:underline"
              >
                Payment tab closed? Click here to reopen.
              </button>
            </>
          )}

          {/* State 4 — finishing / redirecting */}
          {finishing && (
            <>
              <div className="my-6 flex justify-center">
                <div className="h-12 w-12 animate-spin rounded-full border-4 border-muted border-t-primary" />
              </div>
              <p className="text-sm text-muted-foreground">Returning you to the merchant…</p>
            </>
          )}

          {/* State 5 — failed / cancelled (before redirect kicks in) */}
          {failed && !finishing && (
            <div className="mt-2">
              <p className="text-sm font-medium text-destructive">
                {data?.status === "CANCELLED" ? "Payment cancelled" : "Payment session failed"}
              </p>
              <p className="mt-2 text-xs text-muted-foreground">
                {data?.error_message ?? "Redirecting you back to the merchant…"}
              </p>
            </div>
          )}

          <p className="mt-8 text-[10px] uppercase tracking-wider text-muted-foreground">
            Session {sessionId.slice(-8)}
          </p>
        </div>
      </div>
    </div>
  );
}
