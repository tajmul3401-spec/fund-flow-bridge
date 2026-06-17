// POST /api/public/v1/worker/jobs/$jobId/heartbeat
import { createFileRoute } from "@tanstack/react-router";
import { authenticateWorker } from "@/lib/apb/api-auth.server";

const json = (d: unknown, s = 200) => new Response(JSON.stringify(d), { status: s, headers: { "content-type": "application/json" } });

export const Route = createFileRoute("/api/public/v1/worker/jobs/$jobId/heartbeat")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        const auth = await authenticateWorker(request);
        if ("error" in auth) return json({ error: auth.error }, auth.status);
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { error } = await supabaseAdmin
          .from("automation_jobs")
          .update({ last_heartbeat_at: new Date().toISOString() })
          .eq("id", params.jobId)
          .eq("locked_by", auth.worker_id);
        if (error) return json({ error: "update_failed" }, 500);
        return json({ ok: true });
      },
    },
  },
});
