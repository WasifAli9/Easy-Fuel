-- Create payment_methods table for Easy Fuel ZA
-- This table stores customer payment methods (bank accounts and cards)

-- Create enums if they don't exist
DO $$ BEGIN
  CREATE TYPE payment_method_type AS ENUM ('bank_account', 'credit_card', 'debit_card');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE account_type AS ENUM ('cheque', 'savings', 'transmission');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Create payment_methods table
CREATE TABLE IF NOT EXISTS payment_methods (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  method_type payment_method_type NOT NULL,
  label TEXT NOT NULL,
  
  -- Bank account fields
  bank_name TEXT,
  account_holder_name TEXT,
  account_number TEXT,
  branch_code TEXT,
  account_type account_type,
  
  -- Card fields (tokenized for security)
  card_last_four TEXT,
  card_brand TEXT,
  card_expiry_month TEXT,
  card_expiry_year TEXT,
  payment_gateway_token TEXT,
  
  -- Status fields
  is_default BOOLEAN NOT NULL DEFAULT false,
  is_active BOOLEAN NOT NULL DEFAULT true,
  
  -- Timestamps
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_payment_methods_customer_id ON payment_methods(customer_id);
CREATE INDEX IF NOT EXISTS idx_payment_methods_is_default ON payment_methods(customer_id, is_default) WHERE is_default = true;

-- Add RLS (Row Level Security) policies
ALTER TABLE payment_methods ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view their own payment methods
CREATE POLICY "Users can view their own payment methods"
  ON payment_methods
  FOR SELECT
  USING (
    customer_id IN (
      SELECT id FROM customers WHERE user_id = auth.uid()
    )
  );

-- Policy: Users can insert their own payment methods
CREATE POLICY "Users can insert their own payment methods"
  ON payment_methods
  FOR INSERT
  WITH CHECK (
    customer_id IN (
      SELECT id FROM customers WHERE user_id = auth.uid()
    )
  );

-- Policy: Users can update their own payment methods
CREATE POLICY "Users can update their own payment methods"
  ON payment_methods
  FOR UPDATE
  USING (
    customer_id IN (
      SELECT id FROM customers WHERE user_id = auth.uid()
    )
  )
  WITH CHECK (
    customer_id IN (
      SELECT id FROM customers WHERE user_id = auth.uid()
    )
  );

-- Policy: Users can delete their own payment methods
CREATE POLICY "Users can delete their own payment methods"
  ON payment_methods
  FOR DELETE
  USING (
    customer_id IN (
      SELECT id FROM customers WHERE user_id = auth.uid()
    )
  );

-- Trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_payment_methods_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER payment_methods_updated_at
  BEFORE UPDATE ON payment_methods
  FOR EACH ROW
  EXECUTE FUNCTION update_payment_methods_updated_at();

-- Notify PostgREST to reload schema cache
NOTIFY pgrst, 'reload schema';
