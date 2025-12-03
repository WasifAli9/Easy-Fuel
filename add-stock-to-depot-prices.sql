-- Add available_litres (stock) column to depot_prices table
-- This tracks how much fuel is available at each depot for each fuel type
-- Run this in your Supabase SQL Editor

ALTER TABLE depot_prices 
ADD COLUMN IF NOT EXISTS available_litres NUMERIC;

-- Add comment for documentation
COMMENT ON COLUMN depot_prices.available_litres IS 'Available stock in litres for this fuel type at this depot. Drivers can only order less than this amount. Set by supplier when adding/updating fuel pricing.';

-- Trigger PostgREST schema reload
NOTIFY pgrst, 'reload schema';

