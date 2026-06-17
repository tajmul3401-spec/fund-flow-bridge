
-- ===== ROLES =====
CREATE TYPE public.app_role AS ENUM ('admin', 'operator');

CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role public.app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);

GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

CREATE OR REPLACE FUNCTION public.has_any_role(_user_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id)
$$;

CREATE POLICY "Users can view own roles"
ON public.user_roles FOR SELECT
TO authenticated
USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));

-- ===== PROFILES (minimal, for admin user display) =====
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT,
  display_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Profiles viewable by staff"
ON public.profiles FOR SELECT TO authenticated
USING (public.has_any_role(auth.uid()));

CREATE POLICY "Users can update own profile"
ON public.profiles FOR UPDATE TO authenticated
USING (auth.uid() = id);

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, display_name)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'display_name', NEW.email));
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ===== PROVIDERS =====
CREATE TABLE public.providers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  base_url TEXT NOT NULL,
  login_username_enc TEXT NOT NULL,        -- AES-256-GCM ciphertext (base64)
  login_password_enc TEXT NOT NULL,
  flow_config JSONB NOT NULL DEFAULT '{}'::jsonb, -- selector chain, method names, etc
  currency TEXT NOT NULL DEFAULT 'USD',
  exchange_rate NUMERIC(18,6) NOT NULL DEFAULT 1, -- provider currency per 1 USD (manual)
  enabled BOOLEAN NOT NULL DEFAULT true,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.providers TO authenticated;
GRANT ALL ON public.providers TO service_role;
ALTER TABLE public.providers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff view providers"
ON public.providers FOR SELECT TO authenticated
USING (public.has_any_role(auth.uid()));

-- ===== API CLIENTS (SMM panels) =====
CREATE TABLE public.api_clients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  api_key_hash TEXT NOT NULL UNIQUE,        -- sha256(api_key)
  api_key_prefix TEXT NOT NULL,             -- first 8 chars for display
  hmac_secret_enc TEXT NOT NULL,            -- AES-GCM encrypted HMAC secret
  webhook_url TEXT NOT NULL,
  return_url TEXT NOT NULL,                 -- user lands here after payment
  brand_name TEXT NOT NULL DEFAULT 'Secure Payment',
  brand_logo_url TEXT,
  default_provider_id UUID REFERENCES public.providers(id) ON DELETE SET NULL,
  rate_limit_per_min INT NOT NULL DEFAULT 60,
  enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.api_clients TO authenticated;
GRANT ALL ON public.api_clients TO service_role;
ALTER TABLE public.api_clients ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff view api_clients"
ON public.api_clients FOR SELECT TO authenticated
USING (public.has_any_role(auth.uid()));

-- ===== TRANSACTIONS =====
CREATE TYPE public.txn_status AS ENUM (
  'INITIALIZED','WORKER_PICKED','CHECKOUT_READY','REDIRECTED',
  'COMPLETED','FAILED','TIMEOUT','PENDING_MANUAL_AUDIT','CANCELLED'
);

CREATE TABLE public.transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  apb_session_id TEXT NOT NULL UNIQUE,
  api_client_id UUID NOT NULL REFERENCES public.api_clients(id) ON DELETE RESTRICT,
  provider_id UUID NOT NULL REFERENCES public.providers(id) ON DELETE RESTRICT,
  smm_transaction_id TEXT NOT NULL,
  client_user_id TEXT NOT NULL,
  amount NUMERIC(18,2) NOT NULL,
  currency TEXT NOT NULL DEFAULT 'USD',
  payment_method_target TEXT NOT NULL DEFAULT 'visa_mastercard',
  status public.txn_status NOT NULL DEFAULT 'INITIALIZED',
  checkout_url TEXT,
  provider_reference TEXT,
  error_code TEXT,
  error_message TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  initialized_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  worker_picked_at TIMESTAMPTZ,
  checkout_ready_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_txn_status ON public.transactions(status);
CREATE INDEX idx_txn_client ON public.transactions(api_client_id, created_at DESC);
CREATE INDEX idx_txn_session ON public.transactions(apb_session_id);

GRANT SELECT ON public.transactions TO authenticated;
GRANT ALL ON public.transactions TO service_role;
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff view transactions"
ON public.transactions FOR SELECT TO authenticated
USING (public.has_any_role(auth.uid()));

-- ===== AUTOMATION JOBS (queue) =====
CREATE TYPE public.job_status AS ENUM ('PENDING','LOCKED','DONE','FAILED');

CREATE TABLE public.automation_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id UUID NOT NULL REFERENCES public.transactions(id) ON DELETE CASCADE,
  status public.job_status NOT NULL DEFAULT 'PENDING',
  locked_by TEXT,
  locked_at TIMESTAMPTZ,
  last_heartbeat_at TIMESTAMPTZ,
  attempts INT NOT NULL DEFAULT 0,
  max_attempts INT NOT NULL DEFAULT 3,
  result JSONB,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_job_status_created ON public.automation_jobs(status, created_at);
CREATE INDEX idx_job_txn ON public.automation_jobs(transaction_id);

GRANT SELECT ON public.automation_jobs TO authenticated;
GRANT ALL ON public.automation_jobs TO service_role;
ALTER TABLE public.automation_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff view jobs"
ON public.automation_jobs FOR SELECT TO authenticated
USING (public.has_any_role(auth.uid()));

-- Atomic claim function for workers
CREATE OR REPLACE FUNCTION public.claim_automation_jobs(
  _worker_id TEXT,
  _limit INT DEFAULT 1
)
RETURNS SETOF public.automation_jobs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  UPDATE public.automation_jobs aj
  SET status = 'LOCKED',
      locked_by = _worker_id,
      locked_at = now(),
      last_heartbeat_at = now(),
      attempts = aj.attempts + 1,
      updated_at = now()
  WHERE aj.id IN (
    SELECT id FROM public.automation_jobs
    WHERE status = 'PENDING'
       OR (status = 'LOCKED' AND last_heartbeat_at < now() - INTERVAL '15 seconds')
    ORDER BY created_at
    FOR UPDATE SKIP LOCKED
    LIMIT _limit
  )
  RETURNING aj.*;
END;
$$;

-- ===== WEBHOOK DELIVERIES =====
CREATE TYPE public.delivery_status AS ENUM ('PENDING','SUCCESS','FAILED','GIVEN_UP');

CREATE TABLE public.webhook_deliveries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id UUID NOT NULL REFERENCES public.transactions(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  payload JSONB NOT NULL,
  status public.delivery_status NOT NULL DEFAULT 'PENDING',
  attempts INT NOT NULL DEFAULT 0,
  max_attempts INT NOT NULL DEFAULT 5,
  next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_status_code INT,
  last_response TEXT,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_delivery_pending ON public.webhook_deliveries(status, next_attempt_at)
  WHERE status = 'PENDING';

GRANT SELECT ON public.webhook_deliveries TO authenticated;
GRANT ALL ON public.webhook_deliveries TO service_role;
ALTER TABLE public.webhook_deliveries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff view deliveries"
ON public.webhook_deliveries FOR SELECT TO authenticated
USING (public.has_any_role(auth.uid()));

-- ===== AUDIT LOGS =====
CREATE TABLE public.audit_logs (
  id BIGSERIAL PRIMARY KEY,
  actor_type TEXT NOT NULL,           -- 'system' | 'admin' | 'api_client' | 'worker'
  actor_id TEXT,
  action TEXT NOT NULL,
  resource_type TEXT,
  resource_id TEXT,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_audit_resource ON public.audit_logs(resource_type, resource_id, created_at DESC);
CREATE INDEX idx_audit_created ON public.audit_logs(created_at DESC);

GRANT SELECT ON public.audit_logs TO authenticated;
GRANT ALL ON public.audit_logs TO service_role;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff view audit"
ON public.audit_logs FOR SELECT TO authenticated
USING (public.has_any_role(auth.uid()));

-- ===== WORKERS =====
CREATE TABLE public.workers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  worker_token_hash TEXT NOT NULL UNIQUE,
  enabled BOOLEAN NOT NULL DEFAULT true,
  last_seen_at TIMESTAMPTZ,
  last_ip TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.workers TO authenticated;
GRANT ALL ON public.workers TO service_role;
ALTER TABLE public.workers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff view workers"
ON public.workers FOR SELECT TO authenticated
USING (public.has_any_role(auth.uid()));

-- ===== updated_at trigger helper =====
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_providers_updated BEFORE UPDATE ON public.providers
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER trg_api_clients_updated BEFORE UPDATE ON public.api_clients
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER trg_transactions_updated BEFORE UPDATE ON public.transactions
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER trg_jobs_updated BEFORE UPDATE ON public.automation_jobs
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER trg_deliveries_updated BEFORE UPDATE ON public.webhook_deliveries
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
