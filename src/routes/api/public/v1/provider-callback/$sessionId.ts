// GET /api/public/v1/provider-callback/$sessionId
// Provider redirects user back here after payment. We verify the one-time token,
// mark the transaction COMPLETED, fire webhook, then redirect to client's return_url.
import { createFileRoute } from "@tanstack/react-router";
import { dispatchWebhook } from "@/lib/apb/webhook-dispatcher.server";

export const Route = createFileRoute("/api/public/v1/provider-callback/$sessionId")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const url = new URL(request.url);
        const token = url.searchParams.get("token") ?? "";
        const status = (url.searchParams.get("status") ?? "success").toLowerCase();

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: txn } = await supabaseAdmin
          .from("transactions")
          .select("id, api_client_id, provider_callback_token, status")
          .eq("apb_session_id", params.sessionId)
          .maybeSingle();
        if (!txn || !txn.provider_callback_token || txn.provider_callback_token !== token) {
          return new Response("Invalid or expired callback", { status: 403 });
        }

        const { data: client } = await supabaseAdmin
          .from("api_clients")
          .select("return_url")
          .eq("id", txn.api_client_id)
          .maybeSingle();

        const ok = status === "success" || status === "completed" || status === "ok";
        const newStatus = ok ? "COMPLETED" : (status === "pending" ? "PENDING_MANUAL_AUDIT" : "FAILED");

        if (txn.status !== "COMPLETED") {
          await supabaseAdmin.from("transactions").update({
            status: newStatus,
            completed_at: ok ? new Date().toISOString() : null,
            provider_callback_token: null, // single-use
          }).eq("id", txn.id);

          const event = ok ? "transaction.completed"
                           : (newStatus === "PENDING_MANUAL_AUDIT" ? "transaction.pending_manual_audit" : "transaction.failed");
          await dispatchWebhook(txn.id, event, { final_status: newStatus });
        }

        const returnUrl = client?.return_url
          ? `${client.return_url}${client.return_url.includes("?") ? "&" : "?"}apb_session_id=${params.sessionId}&status=${newStatus}`
          : "/";
        return new Response(null, { status: 302, headers: { location: returnUrl } });
      },
    },
  },
});
