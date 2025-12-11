-- Add missing columns to drivers table if they don't exist
-- Run this in your Supabase SQL Editor (https://supabase.com/dashboard → SQL Editor)
-- This fixes the "Could not find the 'za_id_number' column" error and other missing fields

DO $$
BEGIN
  -- Add za_id_number column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'drivers' AND column_name = 'za_id_number'
  ) THEN
    ALTER TABLE drivers ADD COLUMN za_id_number TEXT;
    RAISE NOTICE 'Added za_id_number column to drivers table';
  END IF;

  -- Add passport_number column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'drivers' AND column_name = 'passport_number'
  ) THEN
    ALTER TABLE drivers ADD COLUMN passport_number TEXT;
    RAISE NOTICE 'Added passport_number column to drivers table';
  END IF;

  -- Add id_type column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'drivers' AND column_name = 'id_type'
  ) THEN
    ALTER TABLE drivers ADD COLUMN id_type TEXT;
    RAISE NOTICE 'Added id_type column to drivers table';
  END IF;

  -- Add id_issue_country column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'drivers' AND column_name = 'id_issue_country'
  ) THEN
    ALTER TABLE drivers ADD COLUMN id_issue_country TEXT;
    RAISE NOTICE 'Added id_issue_country column to drivers table';
  END IF;

  -- Add drivers_license_number column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'drivers' AND column_name = 'drivers_license_number'
  ) THEN
    ALTER TABLE drivers ADD COLUMN drivers_license_number TEXT;
    RAISE NOTICE 'Added drivers_license_number column to drivers table';
  END IF;

  -- Add drivers_license_issue_date column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'drivers' AND column_name = 'drivers_license_issue_date'
  ) THEN
    ALTER TABLE drivers ADD COLUMN drivers_license_issue_date TIMESTAMP;
    RAISE NOTICE 'Added drivers_license_issue_date column to drivers table';
  END IF;

  -- Add drivers_license_expiry column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'drivers' AND column_name = 'drivers_license_expiry'
  ) THEN
    ALTER TABLE drivers ADD COLUMN drivers_license_expiry TIMESTAMP;
    RAISE NOTICE 'Added drivers_license_expiry column to drivers table';
  END IF;

  -- Add license_code column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'drivers' AND column_name = 'license_code'
  ) THEN
    ALTER TABLE drivers ADD COLUMN license_code TEXT;
    RAISE NOTICE 'Added license_code column to drivers table';
  END IF;

  -- Add prdp_number column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'drivers' AND column_name = 'prdp_number'
  ) THEN
    ALTER TABLE drivers ADD COLUMN prdp_number TEXT;
    RAISE NOTICE 'Added prdp_number column to drivers table';
  END IF;

  -- Add prdp_category column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'drivers' AND column_name = 'prdp_category'
  ) THEN
    ALTER TABLE drivers ADD COLUMN prdp_category TEXT;
    RAISE NOTICE 'Added prdp_category column to drivers table';
  END IF;

  -- Add address_line_1 column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'drivers' AND column_name = 'address_line_1'
  ) THEN
    ALTER TABLE drivers ADD COLUMN address_line_1 TEXT;
    RAISE NOTICE 'Added address_line_1 column to drivers table';
  END IF;

  -- Add address_line_2 column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'drivers' AND column_name = 'address_line_2'
  ) THEN
    ALTER TABLE drivers ADD COLUMN address_line_2 TEXT;
    RAISE NOTICE 'Added address_line_2 column to drivers table';
  END IF;

  -- Add city column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'drivers' AND column_name = 'city'
  ) THEN
    ALTER TABLE drivers ADD COLUMN city TEXT;
    RAISE NOTICE 'Added city column to drivers table';
  END IF;

  -- Add province column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'drivers' AND column_name = 'province'
  ) THEN
    ALTER TABLE drivers ADD COLUMN province TEXT;
    RAISE NOTICE 'Added province column to drivers table';
  END IF;

  -- Add postal_code column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'drivers' AND column_name = 'postal_code'
  ) THEN
    ALTER TABLE drivers ADD COLUMN postal_code TEXT;
    RAISE NOTICE 'Added postal_code column to drivers table';
  END IF;

  -- Add country column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'drivers' AND column_name = 'country'
  ) THEN
    ALTER TABLE drivers ADD COLUMN country TEXT DEFAULT 'South Africa';
    RAISE NOTICE 'Added country column to drivers table';
  END IF;

  -- Add bank_account_name column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'drivers' AND column_name = 'bank_account_name'
  ) THEN
    ALTER TABLE drivers ADD COLUMN bank_account_name TEXT;
    RAISE NOTICE 'Added bank_account_name column to drivers table';
  END IF;

  -- Add bank_name column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'drivers' AND column_name = 'bank_name'
  ) THEN
    ALTER TABLE drivers ADD COLUMN bank_name TEXT;
    RAISE NOTICE 'Added bank_name column to drivers table';
  END IF;

  -- Add account_number column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'drivers' AND column_name = 'account_number'
  ) THEN
    ALTER TABLE drivers ADD COLUMN account_number TEXT;
    RAISE NOTICE 'Added account_number column to drivers table';
  END IF;

  -- Add branch_code column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'drivers' AND column_name = 'branch_code'
  ) THEN
    ALTER TABLE drivers ADD COLUMN branch_code TEXT;
    RAISE NOTICE 'Added branch_code column to drivers table';
  END IF;

  -- Add company_id column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'drivers' AND column_name = 'company_id'
  ) THEN
    ALTER TABLE drivers ADD COLUMN company_id UUID;
    RAISE NOTICE 'Added company_id column to drivers table';
  END IF;

  -- Add role_in_company column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'drivers' AND column_name = 'role_in_company'
  ) THEN
    ALTER TABLE drivers ADD COLUMN role_in_company TEXT;
    RAISE NOTICE 'Added role_in_company column to drivers table';
  END IF;

  -- Add prdp_issue_date column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'drivers' AND column_name = 'prdp_issue_date'
  ) THEN
    ALTER TABLE drivers ADD COLUMN prdp_issue_date TIMESTAMP;
    RAISE NOTICE 'Added prdp_issue_date column to drivers table';
  END IF;

  -- Add prdp_expiry column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'drivers' AND column_name = 'prdp_expiry'
  ) THEN
    ALTER TABLE drivers ADD COLUMN prdp_expiry TIMESTAMP;
    RAISE NOTICE 'Added prdp_expiry column to drivers table';
  END IF;
END $$;

-- Refresh the PostgREST schema cache so the API can see the new columns
NOTIFY pgrst, 'reload schema';

-- Success message
DO $$
BEGIN
  RAISE NOTICE 'Successfully checked and added missing columns to drivers table!';
  RAISE NOTICE 'Schema cache refreshed. Compliance updates should now work correctly.';
END $$;

