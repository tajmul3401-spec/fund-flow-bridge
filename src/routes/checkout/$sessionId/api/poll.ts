// Internal poll endpoint for gateway page. Returns minimal status info.
import { createFileRoute } from "@tanstack/react-router";

const json = (d: unknown, s = 200) => new Response(JSON.stringify(d), { status: s, headers: { "content-type": "application/json", "cache-control": "no-store" } });

export const Route = createFileRoute("/checkout/$sessionId/api/poll")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: txn } = await supabaseAdmin
          .from("transactions")
          .select("status, checkout_url, error_message, api_client_id")
          .eq("apb_session_id", params.sessionId)
          .maybeSingle();
        if (!txn) return json({ error: "not_found" }, 404);
        const { data: client } = await supabaseAdmin
          .from("api_clients")
          .select("brand_name, brand_logo_url")
          .eq("id", txn.api_client_id)
          .maybeSingle();
        return json({
          status: txn.status,
          checkout_url: txn.checkout_url,
          error_message: txn.error_message,
          brand_name: client?.brand_name ?? "Secure Payment",
          brand_logo_url: client?.brand_logo_url ?? null,
        });
      },
    },
  },
});
