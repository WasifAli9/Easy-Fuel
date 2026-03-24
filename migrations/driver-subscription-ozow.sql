-- Driver subscription tiers + OZOW: extend driver_subscriptions, add subscription_payments, optional subscription_tier on drivers
-- Run in Supabase SQL Editor

-- 1. Add new columns to driver_subscriptions
ALTER TABLE public.driver_subscriptions
  ADD COLUMN IF NOT EXISTS amount_cents integer,
  ADD COLUMN IF NOT EXISTS currency text DEFAULT 'ZAR',
  ADD COLUMN IF NOT EXISTS ozow_transaction_id text,
  ADD COLUMN IF NOT EXISTS current_period_start timestamptz,
  ADD COLUMN IF NOT EXISTS current_period_end timestamptz;

-- 2. Add subscription_tier to drivers (starter | professional | premium)
ALTER TABLE public.drivers
  ADD COLUMN IF NOT EXISTS subscription_tier text;

-- 3. Create subscription_payments table
CREATE TABLE IF NOT EXISTS public.subscription_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_subscription_id uuid NOT NULL REFERENCES public.driver_subscriptions(id) ON DELETE CASCADE,
  amount_cents integer NOT NULL,
  currency text NOT NULL DEFAULT 'ZAR',
  status text NOT NULL,
  ozow_transaction_id text,
  paid_at timestamptz,
  raw jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS subscription_payments_driver_subscription_id_idx ON public.subscription_payments(driver_subscription_id);
CREATE INDEX IF NOT EXISTS subscription_payments_status_idx ON public.subscription_payments(status);
CREATE INDEX IF NOT EXISTS subscription_payments_ozow_transaction_id_idx ON public.subscription_payments(ozow_transaction_id) WHERE ozow_transaction_id IS NOT NULL;

-- RLS (optional – adjust if your app uses service role for server)
ALTER TABLE public.subscription_payments ENABLE ROW LEVEL SECURITY;

-- Allow service role / authenticated to manage (adjust policy to match your auth)
DROP POLICY IF EXISTS "Service role can manage subscription_payments" ON public.subscription_payments;
CREATE POLICY "Service role can manage subscription_payments" ON public.subscription_payments
  FOR ALL USING (true) WITH CHECK (true);

NOTIFY pgrst, 'reload schema';
