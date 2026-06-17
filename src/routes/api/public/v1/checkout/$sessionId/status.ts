// GET /api/public/v1/checkout/$sessionId/status
import { createFileRoute } from "@tanstack/react-router";
import { authenticateApiClient } from "@/lib/apb/api-auth.server";

const json = (d: unknown, s = 200) => new Response(JSON.stringify(d), { status: s, headers: { "content-type": "application/json" } });

export const Route = createFileRoute("/api/public/v1/checkout/$sessionId/status")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const auth = await authenticateApiClient(request);
        if ("error" in auth) return json({ error: auth.error }, auth.status);
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data } = await supabaseAdmin
          .from("transactions")
          .select("apb_session_id,status,amount,currency,provider_reference,checkout_url,checkout_ready_at,redirected_at,completed_at,error_message,smm_transaction_id")
          .eq("apb_session_id", params.sessionId)
          .eq("api_client_id", auth.client.id)
          .maybeSingle();
        if (!data) return json({ error: "not_found" }, 404);
        return json(data);
      },
    },
  },
});
