// Authenticates inbound API requests from SMM panels.
import { sha256Hex, timingSafeEqualStr, hmacSha256Hex, decrypt } from "./crypto.server";

export type AuthedClient = {
  id: string;
  name: string;
  webhook_url: string;
  return_url: string;
  brand_name: string;
  brand_logo_url: string | null;
  default_provider_id: string | null;
  rate_limit_per_min: number;
  hmac_secret: string;
};

export async function authenticateApiClient(request: Request): Promise<{ client: AuthedClient } | { error: string; status: number }> {
  const auth = request.headers.get("authorization") ?? "";
  if (!auth.startsWith("Bearer ")) return { error: "missing_api_key", status: 401 };
  const key = auth.slice(7).trim();
  // Expect: apb_<prefix>_<secret>
  const parts = key.split("_");
  if (parts.length < 3 || parts[0] !== "apb") return { error: "invalid_api_key_format", status: 401 };
  const prefix = `apb_${parts[1]}`;
  const hash = sha256Hex(key);

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("api_clients")
    .select("id,name,api_key_hash,hmac_secret_enc,webhook_url,return_url,brand_name,brand_logo_url,default_provider_id,rate_limit_per_min,enabled")
    .eq("api_key_prefix", prefix)
    .maybeSingle();
  if (error || !data) return { error: "invalid_api_key", status: 401 };
  if (!data.enabled) return { error: "api_client_disabled", status: 403 };
  if (!timingSafeEqualStr(data.api_key_hash, hash)) return { error: "invalid_api_key", status: 401 };

  let hmac_secret = "";
  try { hmac_secret = decrypt(data.hmac_secret_enc); } catch { /* leave empty */ }

  return {
    client: {
      id: data.id,
      name: data.name,
      webhook_url: data.webhook_url,
      return_url: data.return_url,
      brand_name: data.brand_name,
      brand_logo_url: data.brand_logo_url,
      default_provider_id: data.default_provider_id,
      rate_limit_per_min: data.rate_limit_per_min,
      hmac_secret,
    },
  };
}

// Optional: verify inbound HMAC signature if SMM panel signs the request body.
export function verifyInboundHmac(rawBody: string, signatureHeader: string | null, secret: string): boolean {
  if (!signatureHeader || !secret) return false;
  const provided = signatureHeader.replace(/^sha256=/, "").trim();
  const expected = hmacSha256Hex(secret, rawBody);
  return timingSafeEqualStr(provided, expected);
}

export async function authenticateWorker(request: Request): Promise<{ worker_id: string; name: string } | { error: string; status: number }> {
  const auth = request.headers.get("authorization") ?? "";
  if (!auth.startsWith("Bearer ")) return { error: "missing_worker_token", status: 401 };
  const token = auth.slice(7).trim();
  if (!token.startsWith("wrk_")) return { error: "invalid_worker_token", status: 401 };
  const hash = sha256Hex(token);
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("workers")
    .select("id,name,enabled,worker_token_hash")
    .eq("worker_token_hash", hash)
    .maybeSingle();
  if (error || !data) return { error: "invalid_worker_token", status: 401 };
  if (!data.enabled) return { error: "worker_disabled", status: 403 };
  return { worker_id: data.id, name: data.name };
}
