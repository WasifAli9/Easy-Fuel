-- Add tiered pricing support to depot_prices table
-- This allows suppliers to set different prices based on order quantity

-- Step 1: Add min_litres column to depot_prices
ALTER TABLE depot_prices 
ADD COLUMN IF NOT EXISTS min_litres NUMERIC NOT NULL DEFAULT 0;

-- Add comment for documentation
COMMENT ON COLUMN depot_prices.min_litres IS 'Minimum order quantity in litres for this pricing tier. Orders >= min_litres will use this price.';

-- Step 2: Remove the unique constraint on (depot_id, fuel_type_id) 
-- since we now allow multiple pricing tiers per fuel type
-- First, check if the constraint exists and drop it
DO $$ 
BEGIN
  -- Drop unique constraint if it exists
  IF EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'depot_prices_depot_id_fuel_type_id_key'
  ) THEN
    ALTER TABLE depot_prices 
    DROP CONSTRAINT depot_prices_depot_id_fuel_type_id_key;
  END IF;
END $$;

-- Step 3: Create a new unique constraint on (depot_id, fuel_type_id, min_litres)
-- This ensures we can't have duplicate tiers for the same fuel type at the same depot
ALTER TABLE depot_prices 
ADD CONSTRAINT depot_prices_depot_id_fuel_type_id_min_litres_key 
UNIQUE (depot_id, fuel_type_id, min_litres);

-- Step 4: Create index for faster queries when finding pricing tier by quantity
CREATE INDEX IF NOT EXISTS idx_depot_prices_depot_fuel_min_litres 
ON depot_prices(depot_id, fuel_type_id, min_litres DESC);

-- Step 5: Update existing records to have min_litres = 0 (default tier)
UPDATE depot_prices 
SET min_litres = 0 
WHERE min_litres IS NULL OR min_litres = 0;

-- Step 6: Trigger PostgREST schema reload
NOTIFY pgrst, 'reload schema';

-- Notes:
-- - Each fuel type at a depot can now have multiple pricing tiers
-- - Tiers are ordered by min_litres (ascending)
-- - When an order is placed, the system finds the highest tier where order quantity >= min_litres
-- - Example: 
--   Tier 1: min_litres = 0, price = R 70/L (for orders < 1000L)
--   Tier 2: min_litres = 1000, price = R 50/L (for orders >= 1000L)
--   Tier 3: min_litres = 2000, price = R 45/L (for orders >= 2000L)

