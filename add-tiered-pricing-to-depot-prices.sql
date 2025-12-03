-- Add tiered pricing support to depot_prices table
-- This allows suppliers to set different prices based on order quantity
-- This migration is idempotent - safe to run multiple times

-- Step 1: Add min_litres column to depot_prices (if it doesn't exist)
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'depot_prices' 
      AND column_name = 'min_litres'
  ) THEN
    ALTER TABLE depot_prices 
    ADD COLUMN min_litres NUMERIC NOT NULL DEFAULT 0;
    
    -- Add comment for documentation
    COMMENT ON COLUMN depot_prices.min_litres IS 'Minimum order quantity in litres for this pricing tier. Orders >= min_litres will use this price.';
  END IF;
END $$;

-- Step 2: Remove the unique constraint on (depot_id, fuel_type_id) 
-- since we now allow multiple pricing tiers per fuel type
-- Drop the constraint if it exists
DO $$ 
DECLARE
  constraint_name TEXT;
BEGIN
  -- Find the unique constraint on (depot_id, fuel_type_id)
  SELECT conname INTO constraint_name
  FROM pg_constraint c
  JOIN pg_class t ON c.conrelid = t.oid
  WHERE t.relname = 'depot_prices'
    AND c.contype = 'u'
    AND array_length(c.conkey, 1) = 2
    AND EXISTS (
      -- Verify it's on depot_id and fuel_type_id columns
      SELECT 1
      FROM pg_attribute a1, pg_attribute a2
      WHERE a1.attrelid = c.conrelid
        AND a2.attrelid = c.conrelid
        AND a1.attnum = c.conkey[1]
        AND a2.attnum = c.conkey[2]
        AND a1.attname = 'depot_id'
        AND a2.attname = 'fuel_type_id'
    )
  LIMIT 1;
  
  -- Drop the constraint if found
  IF constraint_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE depot_prices DROP CONSTRAINT %I', constraint_name);
  END IF;
END $$;

-- Step 3: Create a new unique constraint on (depot_id, fuel_type_id, min_litres)
-- This ensures we can't have duplicate tiers for the same fuel type at the same depot
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'depot_prices_depot_id_fuel_type_id_min_litres_key'
  ) THEN
    ALTER TABLE depot_prices 
    ADD CONSTRAINT depot_prices_depot_id_fuel_type_id_min_litres_key 
    UNIQUE (depot_id, fuel_type_id, min_litres);
  END IF;
END $$;

-- Step 4: Create index for faster queries when finding pricing tier by quantity
CREATE INDEX IF NOT EXISTS idx_depot_prices_depot_fuel_min_litres 
ON depot_prices(depot_id, fuel_type_id, min_litres DESC);

-- Step 5: Update existing records to have min_litres = 0 (default tier)
-- Only update if min_litres is NULL (safe to run multiple times)
UPDATE depot_prices 
SET min_litres = 0 
WHERE min_litres IS NULL;

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

