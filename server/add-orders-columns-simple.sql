-- Simple migration to add essential missing columns to orders table
-- Run this in your Supabase SQL Editor (https://supabase.com/dashboard → SQL Editor)
-- This fixes the "Could not find the 'access_instructions' column" error

-- Add the essential columns needed for order creation
ALTER TABLE orders 
ADD COLUMN IF NOT EXISTS access_instructions TEXT,
ADD COLUMN IF NOT EXISTS delivery_date TIMESTAMP;

-- Refresh the PostgREST schema cache
NOTIFY pgrst, 'reload schema';

-- Success message
DO $$
BEGIN
  RAISE NOTICE 'Successfully added access_instructions and delivery_date columns to orders table!';
  RAISE NOTICE 'Schema cache refreshed. Order creation should now work.';
  RAISE NOTICE 'Note: Run the comprehensive migration later to add remaining columns.';
END $$;
