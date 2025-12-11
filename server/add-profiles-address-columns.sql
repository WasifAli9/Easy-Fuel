-- Add address columns to profiles table
-- Run this in your Supabase SQL Editor (https://supabase.com/dashboard → SQL Editor)
-- This fixes the "Could not find the 'address_city' column" error

-- Add address columns to profiles table
ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS address_street TEXT,
ADD COLUMN IF NOT EXISTS address_city TEXT,
ADD COLUMN IF NOT EXISTS address_province TEXT,
ADD COLUMN IF NOT EXISTS address_postal_code TEXT,
ADD COLUMN IF NOT EXISTS address_country TEXT DEFAULT 'South Africa';

-- Add comments for documentation
COMMENT ON COLUMN profiles.address_street IS 'Street address';
COMMENT ON COLUMN profiles.address_city IS 'City';
COMMENT ON COLUMN profiles.address_province IS 'Province/state';
COMMENT ON COLUMN profiles.address_postal_code IS 'Postal/ZIP code';
COMMENT ON COLUMN profiles.address_country IS 'Country';

-- Refresh the PostgREST schema cache so the API can see the new columns
NOTIFY pgrst, 'reload schema';

-- Success message
DO $$
BEGIN
  RAISE NOTICE 'Successfully added address columns to profiles table!';
  RAISE NOTICE 'Columns added: address_street, address_city, address_province, address_postal_code, address_country';
  RAISE NOTICE 'Schema cache refreshed. Profile updates should now work correctly.';
END $$;

