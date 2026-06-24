-- Ozow OneAPI payment ledger + platform fee settings

ALTER TABLE app_settings
  ADD COLUMN IF NOT EXISTS customer_order_platform_fee_percent numeric NOT NULL DEFAULT 5,
  ADD COLUMN IF NOT EXISTS depot_order_platform_fee_percent numeric NOT NULL DEFAULT 5;

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS payment_transaction_id uuid;

ALTER TABLE driver_depot_orders
  ADD COLUMN IF NOT EXISTS payment_transaction_id uuid;

CREATE TABLE IF NOT EXISTS payment_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  context_type text NOT NULL,
  context_id uuid NOT NULL,
  payer_user_id uuid,
  payee_type text,
  payee_id uuid,
  gross_cents integer NOT NULL,
  platform_fee_cents integer NOT NULL DEFAULT 0,
  net_payout_cents integer NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'ZAR',
  status text NOT NULL DEFAULT 'pending',
  ozow_transaction_id text,
  ozow_payment_url text,
  transaction_reference text NOT NULL,
  raw jsonb,
  paid_at timestamp,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_payment_transactions_context
  ON payment_transactions (context_type, context_id);

CREATE INDEX IF NOT EXISTS idx_payment_transactions_reference
  ON payment_transactions (transaction_reference);

CREATE TABLE IF NOT EXISTS payout_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_transaction_id uuid NOT NULL REFERENCES payment_transactions(id),
  recipient_type text NOT NULL,
  recipient_id uuid NOT NULL,
  amount_cents integer NOT NULL,
  currency text NOT NULL DEFAULT 'ZAR',
  status text NOT NULL DEFAULT 'pending',
  ozow_payout_id text,
  bank_account_name text,
  bank_name text,
  account_number text,
  branch_code text,
  raw jsonb,
  paid_at timestamp,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_payout_transactions_payment
  ON payout_transactions (payment_transaction_id);
