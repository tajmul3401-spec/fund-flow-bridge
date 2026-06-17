
ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS provider_callback_token TEXT,
  ADD COLUMN IF NOT EXISTS checkout_ready_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS redirected_at TIMESTAMPTZ;

CREATE UNIQUE INDEX IF NOT EXISTS transactions_apb_session_id_idx ON public.transactions(apb_session_id);
CREATE INDEX IF NOT EXISTS transactions_api_client_id_idx ON public.transactions(api_client_id, created_at DESC);
CREATE INDEX IF NOT EXISTS transactions_status_idx ON public.transactions(status);
CREATE INDEX IF NOT EXISTS automation_jobs_status_idx ON public.automation_jobs(status, created_at);
CREATE INDEX IF NOT EXISTS webhook_deliveries_transaction_idx ON public.webhook_deliveries(transaction_id, created_at DESC);
CREATE INDEX IF NOT EXISTS api_clients_prefix_idx ON public.api_clients(api_key_prefix);
