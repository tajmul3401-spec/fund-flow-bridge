import { createFileRoute } from "@tanstack/react-router";
import { dispatchWebhook } from "@/lib/apb/webhook-dispatcher.server";

export const Route = createFileRoute("/checkout/$sessionId/api/cancel")({
  server: {
    handlers: {
      POST: async ({ params }) => {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: txn } = await supabaseAdmin
          .from("transactions")
          .select("id, status")
          .eq("apb_session_id", params.sessionId)
          .maybeSingle();
        // Only flip terminal status if not already COMPLETED
        if (txn && txn.status !== "COMPLETED" && txn.status !== "CANCELLED" && txn.status !== "FAILED") {
          await supabaseAdmin.from("transactions").update({
            status: "CANCELLED",
            error_message: "Cancelled by user on gateway page",
            updated_at: new Date().toISOString(),
          }).eq("id", txn.id);
          await dispatchWebhook(txn.id, "transaction.cancelled", {});
        }
        return new Response(JSON.stringify({ ok: true }), {
          headers: { "content-type": "application/json" },
        });
      },
    },
  },
});
