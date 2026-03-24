-- Supplier Subscription Tiers: new tables and columns
-- Run after base schema and driver_depot_orders table exist.

-- 1. Add subscription and account manager columns to suppliers
-- (account_manager_id is plain uuid so this migration runs even if public.admins does not exist yet)
ALTER TABLE public.suppliers
  ADD COLUMN IF NOT EXISTS subscription_tier text,
  ADD COLUMN IF NOT EXISTS account_manager_id uuid;

COMMENT ON COLUMN public.suppliers.subscription_tier IS 'standard | enterprise; synced from supplier_subscriptions';
COMMENT ON COLUMN public.suppliers.account_manager_id IS 'Enterprise only; references admins(id) when that table exists';

-- 2. Supplier Subscriptions table
CREATE TABLE IF NOT EXISTS public.supplier_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id uuid NOT NULL REFERENCES public.suppliers(id) ON DELETE CASCADE,
  plan_code text NOT NULL,
  status text NOT NULL,
  amount_cents integer,
  currency text DEFAULT 'ZAR',
  ozow_transaction_id text,
  current_period_start timestamptz,
  current_period_end timestamptz,
  next_billing_at timestamptz,
  raw jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_supplier_subscriptions_supplier_id ON public.supplier_subscriptions(supplier_id);
CREATE INDEX IF NOT EXISTS idx_supplier_subscriptions_status ON public.supplier_subscriptions(status);
CREATE INDEX IF NOT EXISTS idx_supplier_subscriptions_current_period_end ON public.supplier_subscriptions(current_period_end);

-- 3. Supplier Subscription Payments table
CREATE TABLE IF NOT EXISTS public.supplier_subscription_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_subscription_id uuid NOT NULL REFERENCES public.supplier_subscriptions(id) ON DELETE CASCADE,
  amount_cents integer NOT NULL,
  currency text NOT NULL DEFAULT 'ZAR',
  status text NOT NULL,
  ozow_transaction_id text,
  paid_at timestamptz,
  raw jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_supplier_subscription_payments_subscription_id ON public.supplier_subscription_payments(supplier_subscription_id);

-- 4. Supplier Settlements table (payout batches: next-day vs same-day by tier)
CREATE TABLE IF NOT EXISTS public.supplier_settlements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id uuid NOT NULL REFERENCES public.suppliers(id) ON DELETE CASCADE,
  period_start timestamptz NOT NULL,
  period_end timestamptz NOT NULL,
  total_cents integer NOT NULL,
  status text NOT NULL,
  settlement_type text NOT NULL,
  paid_at timestamptz,
  reference text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_supplier_settlements_supplier_id ON public.supplier_settlements(supplier_id);
CREATE INDEX IF NOT EXISTS idx_supplier_settlements_period ON public.supplier_settlements(period_start, period_end);

-- 5. Supplier Invoice Templates table (Enterprise custom templates)
CREATE TABLE IF NOT EXISTS public.supplier_invoice_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id uuid NOT NULL REFERENCES public.suppliers(id) ON DELETE CASCADE,
  name text NOT NULL,
  template_type text NOT NULL,
  content jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_supplier_invoice_templates_supplier_id ON public.supplier_invoice_templates(supplier_id);

-- 6. Link driver_depot_orders to settlement (add settlement_id)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'driver_depot_orders') THEN
    ALTER TABLE public.driver_depot_orders
      ADD COLUMN IF NOT EXISTS settlement_id uuid REFERENCES public.supplier_settlements(id) ON DELETE SET NULL;
    CREATE INDEX IF NOT EXISTS idx_driver_depot_orders_settlement_id ON public.driver_depot_orders(settlement_id) WHERE settlement_id IS NOT NULL;
  END IF;
END $$;
