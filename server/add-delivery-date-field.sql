-- Add delivery_date field to orders table
-- Run this in your Supabase SQL Editor (https://supabase.com/dashboard → SQL Editor)

-- Add the delivery_date column to the orders table
ALTER TABLE orders 
ADD COLUMN IF NOT EXISTS delivery_date TIMESTAMP;

-- Add a comment to the column for documentation
COMMENT ON COLUMN orders.delivery_date IS 'Preferred delivery date selected by the customer';

-- Refresh the PostgREST schema cache so the API can see the new column
NOTIFY pgrst, 'reload schema';

-- Success message
DO $$
BEGIN
  RAISE NOTICE '✅ Successfully added delivery_date field to orders table!';
  RAISE NOTICE '✅ Schema cache refreshed. The new field is now available in the API.';
END $$;
