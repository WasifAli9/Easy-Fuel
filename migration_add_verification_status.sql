-- Add verification_status column to delivery_addresses table
-- Run this in your Supabase SQL Editor

-- Step 1: Create the enum type if it doesn't exist
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'address_verification_status') THEN
    CREATE TYPE address_verification_status AS ENUM ('pending', 'verified', 'rejected');
  END IF;
END $$;

-- Step 2: Add the column if it doesn't exist
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'delivery_addresses' 
    AND column_name = 'verification_status'
  ) THEN
    ALTER TABLE public.delivery_addresses 
    ADD COLUMN verification_status address_verification_status NOT NULL DEFAULT 'pending';
  END IF;
END $$;

-- Step 3: Remove is_verified column if it exists (cleanup from old migration)
DO $$ 
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'delivery_addresses' 
    AND column_name = 'is_verified'
  ) THEN
    ALTER TABLE public.delivery_addresses DROP COLUMN is_verified;
  END IF;
END $$;

-- Step 4: Force Supabase to reload the schema cache
NOTIFY pgrst, 'reload schema';

-- Success message
SELECT 'verification_status column added successfully! Schema cache reloaded.' as result;
