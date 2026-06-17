// POST /api/public/v1/checkout/initialize
// SMM panel calls this with an API key to start an add-fund automation job.
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { authenticateApiClient } from "@/lib/apb/api-auth.server";
import { generateSessionId, generateCallbackToken } from "@/lib/apb/crypto.server";

const InitSchema = z.object({
  smm_transaction_id: z.string().min(1).max(128),
  client_user_id: z.string().min(1).max(128),
  amount: z.number().positive(),
  currency: z.string().length(3).default("BDT"),
  payment_method_target: z.string().min(1).max(64),
  provider_id: z.string().uuid().optional(),
  metadata: z.record(z.string(), z.any()).optional(),
});

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } });

export const Route = createFileRoute("/api/public/v1/checkout/initialize")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = await authenticateApiClient(request);
        if ("error" in auth) return json({ error: auth.error }, auth.status);
        const client = auth.client;

        let body: unknown;
        try { body = await request.json(); } catch { return json({ error: "invalid_json" }, 400); }
        const parsed = InitSchema.safeParse(body);
        if (!parsed.success) return json({ error: "invalid_payload", details: parsed.error.flatten() }, 400);

        const providerId = parsed.data.provider_id ?? client.default_provider_id;
        if (!providerId) return json({ error: "no_provider", message: "provider_id missing and no default configured" }, 400);

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: provider } = await supabaseAdmin
          .from("providers")
          .select("id, enabled, currency, exchange_rate")
          .eq("id", providerId)
          .maybeSingle();
        if (!provider) return json({ error: "provider_not_found" }, 400);
        if (!provider.enabled) return json({ error: "provider_disabled" }, 503);

        // Idempotency: if same smm_transaction_id from same client, return existing.
        const { data: existing } = await supabaseAdmin
          .from("transactions")
          .select("apb_session_id, status, checkout_url")
          .eq("api_client_id", client.id)
          .eq("smm_transaction_id", parsed.data.smm_transaction_id)
          .maybeSingle();
        if (existing) {
          return json({
            apb_session_id: existing.apb_session_id,
            status: existing.status,
            checkout_url: existing.status === "INITIALIZED" || existing.status === "WORKER_PICKED"
              ? null
              : existing.checkout_url,
            gateway_url: `${new URL(request.url).origin}/checkout/${existing.apb_session_id}`,
          });
        }

        const sessionId = generateSessionId();
        const callbackToken = generateCallbackToken();

        const { data: txn, error: txnErr } = await supabaseAdmin
          .from("transactions")
          .insert({
            apb_session_id: sessionId,
            api_client_id: client.id,
            provider_id: providerId,
            smm_transaction_id: parsed.data.smm_transaction_id,
            client_user_id: parsed.data.client_user_id,
            amount: parsed.data.amount,
            currency: parsed.data.currency,
            payment_method_target: parsed.data.payment_method_target,
            status: "INITIALIZED",
            provider_callback_token: callbackToken,
            metadata: parsed.data.metadata ?? {},
          })
          .select("id")
          .single();
        if (txnErr || !txn) return json({ error: "create_failed", details: txnErr?.message }, 500);

        await supabaseAdmin.from("automation_jobs").insert({
          transaction_id: txn.id,
          status: "PENDING",
          attempts: 0,
          max_attempts: 3,
        });

        await supabaseAdmin.from("audit_logs").insert({
          actor_type: "api_client",
          actor_id: client.id,
          action: "checkout.initialize",
          resource_type: "transaction",
          resource_id: txn.id,
          details: { smm_transaction_id: parsed.data.smm_transaction_id, amount: parsed.data.amount },
        });

        const origin = new URL(request.url).origin;
        return json({
          apb_session_id: sessionId,
          status: "INITIALIZED",
          gateway_url: `${origin}/checkout/${sessionId}`,
        }, 201);
      },
    },
  },
});
