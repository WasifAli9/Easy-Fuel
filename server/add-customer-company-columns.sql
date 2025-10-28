-- Add missing company information columns to customers table
-- Run this in your Supabase SQL Editor (https://supabase.com/dashboard → SQL Editor)
-- This fixes the "Could not find the 'trading_as' column" error and other missing fields

-- Add company and business information columns to customers table
ALTER TABLE customers 
ADD COLUMN IF NOT EXISTS company_name TEXT,
ADD COLUMN IF NOT EXISTS trading_as TEXT,
ADD COLUMN IF NOT EXISTS vat_number TEXT,
ADD COLUMN IF NOT EXISTS registration_number TEXT,
ADD COLUMN IF NOT EXISTS sars_tax_number TEXT,
ADD COLUMN IF NOT EXISTS za_id_number TEXT,
ADD COLUMN IF NOT EXISTS dob TIMESTAMP,
ADD COLUMN IF NOT EXISTS default_payment_method_id TEXT,
ADD COLUMN IF NOT EXISTS delivery_preferences TEXT;

-- Add comments for documentation
COMMENT ON COLUMN customers.company_name IS 'Registered company name';
COMMENT ON COLUMN customers.trading_as IS 'Trading name (if different from registered name)';
COMMENT ON COLUMN customers.vat_number IS 'VAT registration number';
COMMENT ON COLUMN customers.registration_number IS 'Company registration number';
COMMENT ON COLUMN customers.sars_tax_number IS 'SARS tax number';
COMMENT ON COLUMN customers.za_id_number IS 'South African ID number';
COMMENT ON COLUMN customers.dob IS 'Date of birth';
COMMENT ON COLUMN customers.default_payment_method_id IS 'Default payment method';
COMMENT ON COLUMN customers.delivery_preferences IS 'Delivery preferences and notes';

-- Refresh the PostgREST schema cache so the API can see the new columns
NOTIFY pgrst, 'reload schema';

-- Success message
DO $$
BEGIN
  RAISE NOTICE 'Successfully added company information columns to customers table!';
  RAISE NOTICE 'Columns added: company_name, trading_as, vat_number, registration_number, sars_tax_number, za_id_number, dob, default_payment_method_id, delivery_preferences';
  RAISE NOTICE 'Schema cache refreshed. Profile updates should now work correctly.';
END $$;
