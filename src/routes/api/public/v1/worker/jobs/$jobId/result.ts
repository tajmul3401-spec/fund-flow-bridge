// POST /api/public/v1/worker/jobs/$jobId/result
// Worker reports either checkout_url + provider_reference (success) or error (failure).
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { authenticateWorker } from "@/lib/apb/api-auth.server";
import { dispatchWebhook } from "@/lib/apb/webhook-dispatcher.server";

const json = (d: unknown, s = 200) => new Response(JSON.stringify(d), { status: s, headers: { "content-type": "application/json" } });

const ResultSchema = z.discriminatedUnion("outcome", [
  z.object({
    outcome: z.literal("success"),
    checkout_url: z.string().url(),
    provider_reference: z.string().optional(),
  }),
  z.object({
    outcome: z.literal("failure"),
    error: z.string().min(1).max(1000),
    retryable: z.boolean().default(false),
  }),
]);

export const Route = createFileRoute("/api/public/v1/worker/jobs/$jobId/result")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        const auth = await authenticateWorker(request);
        if ("error" in auth) return json({ error: auth.error }, auth.status);
        let body: unknown;
        try { body = await request.json(); } catch { return json({ error: "invalid_json" }, 400); }
        const parsed = ResultSchema.safeParse(body);
        if (!parsed.success) return json({ error: "invalid_payload", details: parsed.error.flatten() }, 400);

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: job } = await supabaseAdmin
          .from("automation_jobs")
          .select("id, transaction_id, attempts, max_attempts, locked_by")
          .eq("id", params.jobId)
          .maybeSingle();
        if (!job) return json({ error: "job_not_found" }, 404);
        if (job.locked_by !== auth.worker_id) return json({ error: "not_owner" }, 403);

        if (parsed.data.outcome === "success") {
          await supabaseAdmin.from("transactions").update({
            status: "CHECKOUT_READY",
            checkout_url: parsed.data.checkout_url,
            provider_reference: parsed.data.provider_reference ?? null,
            checkout_ready_at: new Date().toISOString(),
          }).eq("id", job.transaction_id);
          await supabaseAdmin.from("automation_jobs").update({
            status: "DONE",
            result: { checkout_url: parsed.data.checkout_url },
          }).eq("id", job.id);
          await dispatchWebhook(job.transaction_id, "transaction.checkout_ready", {
            checkout_url: parsed.data.checkout_url,
            provider_reference: parsed.data.provider_reference ?? null,
          });
          return json({ ok: true });
        }

        // failure
        const giveUp = !parsed.data.retryable || job.attempts >= job.max_attempts;
        if (giveUp) {
          await supabaseAdmin.from("transactions").update({
            status: "FAILED",
            error_message: parsed.data.error,
          }).eq("id", job.transaction_id);
          await supabaseAdmin.from("automation_jobs").update({
            status: "FAILED",
            error: parsed.data.error,
          }).eq("id", job.id);
          await dispatchWebhook(job.transaction_id, "transaction.failed", { error: parsed.data.error });
        } else {
          // requeue
          await supabaseAdmin.from("automation_jobs").update({
            status: "PENDING",
            locked_by: null,
            locked_at: null,
            last_heartbeat_at: null,
            error: parsed.data.error,
          }).eq("id", job.id);
        }
        return json({ ok: true, retried: !giveUp });
      },
    },
  },
});
