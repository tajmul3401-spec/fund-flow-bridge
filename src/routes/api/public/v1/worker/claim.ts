// POST /api/public/v1/worker/claim - automation worker pulls pending jobs
import { createFileRoute } from "@tanstack/react-router";
import { authenticateWorker } from "@/lib/apb/api-auth.server";
import { decrypt } from "@/lib/apb/crypto.server";

const json = (d: unknown, s = 200) => new Response(JSON.stringify(d), { status: s, headers: { "content-type": "application/json" } });

export const Route = createFileRoute("/api/public/v1/worker/claim")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = await authenticateWorker(request);
        if ("error" in auth) return json({ error: auth.error }, auth.status);

        let body: { limit?: number } = {};
        try { body = await request.json(); } catch { /* ignore */ }
        const limit = Math.min(Math.max(Number(body.limit ?? 1), 1), 10);

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        await supabaseAdmin.from("workers").update({ last_seen_at: new Date().toISOString() }).eq("id", auth.worker_id);

        const { data: jobs, error } = await supabaseAdmin.rpc("claim_automation_jobs", {
          _worker_id: auth.worker_id,
          _limit: limit,
        });
        if (error) return json({ error: "claim_failed", details: error.message }, 500);
        if (!jobs?.length) return json({ jobs: [] });

        const txnIds = jobs.map((j: { transaction_id: string }) => j.transaction_id);
        const { data: txns } = await supabaseAdmin
          .from("transactions")
          .select("id, apb_session_id, amount, currency, payment_method_target, provider_callback_token, provider_id, metadata")
          .in("id", txnIds);

        const { data: providers } = await supabaseAdmin
          .from("providers")
          .select("id, name, base_url, login_username_enc, login_password_enc, flow_config, exchange_rate, currency")
          .in("id", Array.from(new Set((txns ?? []).map(t => t.provider_id))));

        const origin = new URL(request.url).origin;
        const enriched = jobs.map((j: { id: string; transaction_id: string; attempts: number }) => {
          const t = txns?.find(x => x.id === j.transaction_id);
          const p = providers?.find(x => t && x.id === t.provider_id);
          if (!t || !p) return null;
          let username = "", password = "";
          try { username = decrypt(p.login_username_enc); } catch { /* ignore */ }
          try { password = decrypt(p.login_password_enc); } catch { /* ignore */ }
          // Provider-local amount after exchange rate
          const providerAmount = Number((t.amount * Number(p.exchange_rate || 1)).toFixed(2));
          return {
            job_id: j.id,
            transaction_id: t.id,
            apb_session_id: t.apb_session_id,
            attempt: j.attempts,
            provider: {
              id: p.id,
              name: p.name,
              base_url: p.base_url,
              username,
              password,
              flow_config: p.flow_config,
              currency: p.currency,
            },
            amount: providerAmount,
            client_amount: Number(t.amount),
            payment_method_target: t.payment_method_target,
            provider_callback_url: `${origin}/api/public/v1/provider-callback/${t.apb_session_id}?token=${t.provider_callback_token}`,
            metadata: t.metadata ?? {},
          };
        }).filter(Boolean);

        return json({ jobs: enriched });
      },
    },
  },
});
