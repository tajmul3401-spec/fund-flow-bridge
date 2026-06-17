// Sends outbound webhooks to SMM panels with HMAC signature & retry tracking.
import { hmacSha256Hex } from "./crypto.server";

export type WebhookEvent =
  | "transaction.checkout_ready"
  | "transaction.redirected"
  | "transaction.completed"
  | "transaction.failed"
  | "transaction.cancelled"
  | "transaction.pending_manual_audit";

const MAX_ATTEMPTS = 6;
const BACKOFFS_MS = [0, 5_000, 30_000, 2 * 60_000, 10 * 60_000, 60 * 60_000];

export async function dispatchWebhook(transactionId: string, event: WebhookEvent, payload: Record<string, unknown>) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

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

  const { data: delivery } = await supabaseAdmin
    .from("webhook_deliveries")
    .insert({
      transaction_id: txn.id,
      url: client.webhook_url,
      payload: JSON.parse(body),
      status: "PENDING",
      attempts: 0,
      max_attempts: MAX_ATTEMPTS,
      next_attempt_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  await attemptDelivery(delivery?.id, client.webhook_url, body, signature, 0);
}

async function attemptDelivery(deliveryId: string | undefined, url: string, body: string, signature: string, attempt: number) {
  if (!deliveryId) return;
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const nextAttempt = attempt + 1;
  const giveUp = nextAttempt >= MAX_ATTEMPTS;
  const nextAt = giveUp ? new Date(Date.now() + 365 * 24 * 60 * 60_000).toISOString()
                        : new Date(Date.now() + BACKOFFS_MS[nextAttempt]).toISOString();
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
      attempts: nextAttempt,
      status: ok ? "SUCCESS" : (giveUp ? "GIVEN_UP" : "FAILED"),
      last_status_code: res.status,
      last_response: responseText,
      next_attempt_at: nextAt,
    }).eq("id", deliveryId);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await supabaseAdmin.from("webhook_deliveries").update({
      attempts: nextAttempt,
      status: giveUp ? "GIVEN_UP" : "FAILED",
      last_error: msg,
      next_attempt_at: nextAt,
    }).eq("id", deliveryId);
  }
}
