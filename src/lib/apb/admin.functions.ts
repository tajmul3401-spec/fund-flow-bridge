// Admin server functions: CRUD for providers, api_clients, workers; bootstrap helper.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertAdmin(ctx: { userId: string }) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin.rpc("has_role", { _user_id: ctx.userId, _role: "admin" });
  if (!data) throw new Error("forbidden");
}

// ---------- Bootstrap (claim first admin) ----------
export const bootstrapStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: any_admin } = await context.supabase.rpc("has_any_role", { _user_id: context.userId });
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { count } = await supabaseAdmin.from("user_roles").select("user_id", { count: "exact", head: true });
    return { has_any_admin: (count ?? 0) > 0, current_user_has_role: Boolean(any_admin) };
  });

export const claimFirstAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { count } = await supabaseAdmin.from("user_roles").select("user_id", { count: "exact", head: true });
    if ((count ?? 0) > 0) throw new Error("admin_already_exists");
    const { error } = await supabaseAdmin.from("user_roles").insert({ user_id: context.userId, role: "admin" });
    if (error) throw new Error(error.message);
    await supabaseAdmin.from("audit_logs").insert({
      actor_type: "user", actor_id: context.userId, action: "bootstrap.claim_admin",
      resource_type: "user_roles", resource_id: context.userId, details: {},
    });
    return { ok: true };
  });

// ---------- Providers ----------
const ProviderSchema = z.object({
  name: z.string().min(1).max(100),
  base_url: z.string().url(),
  username: z.string().default(""),
  password: z.string().default(""),
  flow_config: z.record(z.string(), z.any()).default({}),
  currency: z.string().length(3).default("BDT"),
  exchange_rate: z.number().positive().default(1),
  enabled: z.boolean().default(true),
  notes: z.string().optional(),
});

export const listProviders = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin
      .from("providers")
      .select("id,name,base_url,currency,exchange_rate,enabled,notes,created_at,flow_config")
      .order("created_at", { ascending: false });
    return data ?? [];
  });

export const upsertProvider = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id?: string } & z.infer<typeof ProviderSchema>) => d)
  .handler(async ({ context, data }) => {
    await assertAdmin(context);
    const parsed = ProviderSchema.parse(data);
    const isUpdate = Boolean(data.id);
    if (!isUpdate) {
      if (!parsed.username) throw new Error("username_required");
      if (!parsed.password) throw new Error("password_required");
    }
    const { encrypt } = await import("@/lib/apb/crypto.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const payload: Record<string, unknown> = {
      name: parsed.name,
      base_url: parsed.base_url,
      flow_config: parsed.flow_config,
      currency: parsed.currency,
      exchange_rate: parsed.exchange_rate,
      enabled: parsed.enabled,
      notes: parsed.notes ?? null,
    };
    if (parsed.username) payload.login_username_enc = encrypt(parsed.username);
    if (parsed.password) payload.login_password_enc = encrypt(parsed.password);
    if (data.id) {
      const { error } = await supabaseAdmin.from("providers").update(payload as never).eq("id", data.id);
      if (error) throw new Error(error.message);
      return { id: data.id };
    }
    const { data: row, error } = await supabaseAdmin.from("providers").insert(payload as never).select("id").single();
    if (error) throw new Error(error.message);
    return { id: row.id };
  });

export const deleteProvider = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => d)
  .handler(async ({ context, data }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("providers").delete().eq("id", data.id);
    return { ok: true };
  });

// ---------- API Clients ----------
const ApiClientSchema = z.object({
  name: z.string().min(1).max(100),
  brand_name: z.string().min(1).max(100),
  brand_logo_url: z.string().url().optional().or(z.literal("")),
  webhook_url: z.string().url(),
  return_url: z.string().url(),
  default_provider_id: z.string().uuid().optional().or(z.literal("")),
  rate_limit_per_min: z.number().int().min(1).max(10000).default(60),
  enabled: z.boolean().default(true),
});

export const listApiClients = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin
      .from("api_clients")
      .select("id,name,brand_name,brand_logo_url,webhook_url,return_url,default_provider_id,rate_limit_per_min,enabled,api_key_prefix,created_at")
      .order("created_at", { ascending: false });
    return data ?? [];
  });

export const createApiClient = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: z.infer<typeof ApiClientSchema>) => d)
  .handler(async ({ context, data }) => {
    await assertAdmin(context);
    const parsed = ApiClientSchema.parse(data);
    const { generateApiKey, generateHmacSecret, encrypt } = await import("@/lib/apb/crypto.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const apiKey = generateApiKey();
    const hmacSecret = generateHmacSecret();
    const { data: row, error } = await supabaseAdmin.from("api_clients").insert({
      name: parsed.name,
      brand_name: parsed.brand_name,
      brand_logo_url: parsed.brand_logo_url || null,
      webhook_url: parsed.webhook_url,
      return_url: parsed.return_url,
      default_provider_id: parsed.default_provider_id || null,
      rate_limit_per_min: parsed.rate_limit_per_min,
      enabled: parsed.enabled,
      api_key_prefix: apiKey.prefix,
      api_key_hash: apiKey.hash,
      hmac_secret_enc: encrypt(hmacSecret),
    }).select("id").single();
    if (error) throw new Error(error.message);
    // Return plaintext only this once.
    return { id: row.id, api_key: apiKey.plaintext, hmac_secret: hmacSecret };
  });

export const updateApiClient = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string } & Partial<z.infer<typeof ApiClientSchema>>) => d)
  .handler(async ({ context, data }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { id, ...rest } = data;
    const upd: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(rest)) if (v !== undefined && v !== "") upd[k] = v;
    if (rest.brand_logo_url === "") upd.brand_logo_url = null;
    if (rest.default_provider_id === "") upd.default_provider_id = null;
    const { error } = await supabaseAdmin.from("api_clients").update(upd as never).eq("id", id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const rotateApiKey = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => d)
  .handler(async ({ context, data }) => {
    await assertAdmin(context);
    const { generateApiKey } = await import("@/lib/apb/crypto.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const k = generateApiKey();
    const { error } = await supabaseAdmin.from("api_clients").update({
      api_key_prefix: k.prefix, api_key_hash: k.hash,
    }).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { api_key: k.plaintext };
  });

export const deleteApiClient = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => d)
  .handler(async ({ context, data }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("api_clients").delete().eq("id", data.id);
    return { ok: true };
  });

// ---------- Workers ----------
export const listWorkers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin.from("workers").select("id,name,enabled,last_seen_at,last_ip,metadata,created_at").order("created_at", { ascending: false });
    return data ?? [];
  });

export const createWorker = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { name: string }) => d)
  .handler(async ({ context, data }) => {
    await assertAdmin(context);
    const { generateWorkerToken } = await import("@/lib/apb/crypto.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const t = generateWorkerToken();
    const { data: row, error } = await supabaseAdmin.from("workers").insert({
      name: data.name, worker_token_hash: t.hash, enabled: true, metadata: {},
    }).select("id").single();
    if (error) throw new Error(error.message);
    return { id: row.id, worker_token: t.plaintext };
  });

export const deleteWorker = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => d)
  .handler(async ({ context, data }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("workers").delete().eq("id", data.id);
    return { ok: true };
  });

// ---------- Transactions ----------
export const listTransactions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { limit?: number; status?: string } | undefined) => d ?? {})
  .handler(async ({ context, data }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    let q = supabaseAdmin
      .from("transactions")
      .select("id,apb_session_id,api_client_id,provider_id,smm_transaction_id,client_user_id,amount,currency,payment_method_target,status,provider_reference,checkout_url,error_message,created_at,completed_at")
      .order("created_at", { ascending: false })
      .limit(Math.min(data?.limit ?? 100, 500));
    if (data?.status) q = q.eq("status", data.status as never);
    const { data: rows } = await q;
    return rows ?? [];
  });

export const dashboardStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const since = new Date(Date.now() - 24 * 60 * 60_000).toISOString();
    const [total24, completed24, failed24, pending] = await Promise.all([
      supabaseAdmin.from("transactions").select("id", { count: "exact", head: true }).gte("created_at", since),
      supabaseAdmin.from("transactions").select("id", { count: "exact", head: true }).gte("created_at", since).eq("status", "COMPLETED"),
      supabaseAdmin.from("transactions").select("id", { count: "exact", head: true }).gte("created_at", since).eq("status", "FAILED"),
      supabaseAdmin.from("automation_jobs").select("id", { count: "exact", head: true }).eq("status", "PENDING"),
    ]);
    return {
      total_24h: total24.count ?? 0,
      completed_24h: completed24.count ?? 0,
      failed_24h: failed24.count ?? 0,
      jobs_pending: pending.count ?? 0,
    };
  });

// ---------- Test Transaction (admin-only, bypasses API auth) ----------
const TestTxnSchema = z.object({
  provider_id: z.string().uuid(),
  amount: z.number().positive().default(1),
  payment_method_target: z.string().min(1).default("Visa | Master | Amex | Nexus"),
});

export const createTestTransaction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: z.infer<typeof TestTxnSchema>) => d)
  .handler(async ({ context, data }) => {
    await assertAdmin(context);
    const parsed = TestTxnSchema.parse(data);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { generateSessionId, generateCallbackToken } = await import("@/lib/apb/crypto.server");

    const { data: provider } = await supabaseAdmin
      .from("providers").select("id, enabled, name").eq("id", parsed.provider_id).maybeSingle();
    if (!provider) throw new Error("provider_not_found");
    if (!provider.enabled) throw new Error("provider_disabled");

    // Find or create a synthetic "admin-test" api_client so FK is satisfied.
    let { data: testClient } = await supabaseAdmin
      .from("api_clients").select("id").eq("name", "__admin_test__").maybeSingle();
    if (!testClient) {
      const { generateApiKey, generateHmacSecret, encrypt } = await import("@/lib/apb/crypto.server");
      const k = generateApiKey();
      const h = generateHmacSecret();
      const { data: created, error } = await supabaseAdmin.from("api_clients").insert({
        name: "__admin_test__",
        brand_name: "Admin Test",
        webhook_url: "https://example.com/webhook",
        return_url: "https://example.com/return",
        default_provider_id: parsed.provider_id,
        rate_limit_per_min: 60,
        enabled: false, // disabled so it can't be used via public API
        api_key_prefix: k.prefix,
        api_key_hash: k.hash,
        hmac_secret_enc: encrypt(h),
      }).select("id").single();
      if (error) throw new Error(error.message);
      testClient = created;
    }

    const sessionId = generateSessionId();
    const callbackToken = generateCallbackToken();
    const smmTxnId = `test_${Date.now()}`;

    const { data: txn, error: txnErr } = await supabaseAdmin.from("transactions").insert({
      apb_session_id: sessionId,
      api_client_id: testClient!.id,
      provider_id: parsed.provider_id,
      smm_transaction_id: smmTxnId,
      client_user_id: `admin_${context.userId.slice(0, 8)}`,
      amount: parsed.amount,
      currency: "BDT",
      payment_method_target: parsed.payment_method_target,
      status: "INITIALIZED",
      provider_callback_token: callbackToken,
      metadata: { test: true, created_by: context.userId },
    }).select("id").single();
    if (txnErr || !txn) throw new Error(txnErr?.message ?? "create_failed");

    await supabaseAdmin.from("automation_jobs").insert({
      transaction_id: txn.id, status: "PENDING", attempts: 0, max_attempts: 3,
    });

    await supabaseAdmin.from("audit_logs").insert({
      actor_type: "user", actor_id: context.userId, action: "admin.test_transaction",
      resource_type: "transaction", resource_id: txn.id,
      details: { provider_id: parsed.provider_id, amount: parsed.amount },
    });

    return {
      apb_session_id: sessionId,
      transaction_id: txn.id,
      gateway_url: `/checkout/${sessionId}`,
      smm_transaction_id: smmTxnId,
    };
  });
