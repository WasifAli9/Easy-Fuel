-- Add billing address columns to customers table
-- Run this in your Supabase SQL Editor (https://supabase.com/dashboard → SQL Editor)
-- This fixes the "Could not find the 'billing_address_city' column" error

-- Add billing address columns to customers table
ALTER TABLE customers 
ADD COLUMN IF NOT EXISTS billing_address_street TEXT,
ADD COLUMN IF NOT EXISTS billing_address_city TEXT,
ADD COLUMN IF NOT EXISTS billing_address_province TEXT,
ADD COLUMN IF NOT EXISTS billing_address_postal_code TEXT,
ADD COLUMN IF NOT EXISTS billing_address_country TEXT;

-- Add comments for documentation
COMMENT ON COLUMN customers.billing_address_street IS 'Street address for billing';
COMMENT ON COLUMN customers.billing_address_city IS 'City for billing address';
COMMENT ON COLUMN customers.billing_address_province IS 'Province/state for billing address';
COMMENT ON COLUMN customers.billing_address_postal_code IS 'Postal/ZIP code for billing address';
COMMENT ON COLUMN customers.billing_address_country IS 'Country for billing address';

-- Refresh the PostgREST schema cache so the API can see the new columns
NOTIFY pgrst, 'reload schema';

-- Success message
DO $$
BEGIN
  RAISE NOTICE 'Successfully added billing address columns to customers table!';
  RAISE NOTICE 'Columns added: billing_address_street, billing_address_city, billing_address_province, billing_address_postal_code, billing_address_country';
  RAISE NOTICE 'Schema cache refreshed. Profile updates should now work correctly.';
END $$;
