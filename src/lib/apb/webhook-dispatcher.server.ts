// Sends outbound webhooks to SMM panels with HMAC signature & retry tracking.
import { hmacSha256Hex } from "./crypto.server";

export type WebhookEvent =
  | "transaction.checkout_ready"
  | "transaction.redirected"
  | "transaction.completed"
  | "transaction.failed"
  | "transaction.pending_manual_audit";

const MAX_ATTEMPTS = 6;
const BACKOFFS_MS = [0, 5_000, 30_000, 2 * 60_000, 10 * 60_000, 60 * 60_000];

export async function dispatchWebhook(transactionId: string, event: WebhookEvent, payload: Record<string, unknown>) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  // Load transaction + client
  const { data: txn } = await supabaseAdmin
    .from("transactions")
    .select("id, api_client_id, apb_session_id")
    .eq("id", transactionId)
    .maybeSingle();
  if (!txn) return;
  const { data: client } = await supabaseAdmin
    .from("api_clients")
    .select("webhook_url, hmac_secret_enc")
    .eq("id", txn.api_client_id)
    .maybeSingle();
  if (!client?.webhook_url) return;

  const { decrypt } = await import("./crypto.server");
  let secret = "";
  try { secret = decrypt(client.hmac_secret_enc); } catch { /* ignore */ }

  const body = JSON.stringify({
    event,
    apb_session_id: txn.apb_session_id,
    transaction_id: txn.id,
    timestamp: new Date().toISOString(),
    data: payload,
  });
  const signature = secret ? `sha256=${hmacSha256Hex(secret, body)}` : "";

  // Insert delivery row
  const { data: delivery } = await supabaseAdmin
    .from("webhook_deliveries")
    .insert({
      transaction_id: txn.id,
      api_client_id: txn.api_client_id,
      event,
      payload: JSON.parse(body),
      target_url: client.webhook_url,
      status: "PENDING",
      attempts: 0,
      max_attempts: MAX_ATTEMPTS,
    })
    .select("id")
    .single();

  await attemptDelivery(delivery?.id, client.webhook_url, body, signature, 0);
}

async function attemptDelivery(deliveryId: string | undefined, url: string, body: string, signature: string, attempt: number) {
  if (!deliveryId) return;
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  try {
    const ctrl = new AbortController();
    const timeout = setTimeout(() => ctrl.abort(), 15_000);
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "user-agent": "APB-Webhook/1.0",
        "x-apb-signature": signature,
        "x-apb-timestamp": String(Math.floor(Date.now() / 1000)),
      },
      body,
      signal: ctrl.signal,
    });
    clearTimeout(timeout);
    const ok = res.status >= 200 && res.status < 300;
    const responseText = (await res.text()).slice(0, 2000);
    await supabaseAdmin.from("webhook_deliveries").update({
      attempts: attempt + 1,
      status: ok ? "SUCCESS" : (attempt + 1 >= MAX_ATTEMPTS ? "GIVEN_UP" : "FAILED"),
      response_status: res.status,
      response_body: responseText,
      last_attempted_at: new Date().toISOString(),
      next_attempt_at: ok || attempt + 1 >= MAX_ATTEMPTS ? null : new Date(Date.now() + BACKOFFS_MS[attempt + 1]).toISOString(),
    }).eq("id", deliveryId);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await supabaseAdmin.from("webhook_deliveries").update({
      attempts: attempt + 1,
      status: attempt + 1 >= MAX_ATTEMPTS ? "GIVEN_UP" : "FAILED",
      error: msg,
      last_attempted_at: new Date().toISOString(),
      next_attempt_at: attempt + 1 >= MAX_ATTEMPTS ? null : new Date(Date.now() + BACKOFFS_MS[attempt + 1]).toISOString(),
    }).eq("id", deliveryId);
  }
}
