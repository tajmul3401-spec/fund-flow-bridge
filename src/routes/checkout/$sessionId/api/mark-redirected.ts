import { createFileRoute } from "@tanstack/react-router";
import { dispatchWebhook } from "@/lib/apb/webhook-dispatcher.server";

export const Route = createFileRoute("/checkout/$sessionId/api/mark-redirected")({
  server: {
    handlers: {
      POST: async ({ params }) => {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: txn } = await supabaseAdmin
          .from("transactions")
          .select("id, status")
          .eq("apb_session_id", params.sessionId)
          .maybeSingle();
        if (txn && txn.status === "CHECKOUT_READY") {
          await supabaseAdmin.from("transactions").update({
            status: "REDIRECTED",
            redirected_at: new Date().toISOString(),
          }).eq("id", txn.id);
          await dispatchWebhook(txn.id, "transaction.redirected", {});
        }
        return new Response(JSON.stringify({ ok: true }), { headers: { "content-type": "application/json" } });
      },
    },
  },
});
