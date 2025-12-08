-- Add price_per_km_cents column to app_settings table
-- This will be used to calculate delivery fees automatically

DO $$
BEGIN
  -- Check if column exists
  IF NOT EXISTS (
    SELECT 1 
    FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'app_settings'
    AND column_name = 'price_per_km_cents'
  ) THEN
    ALTER TABLE app_settings
    ADD COLUMN price_per_km_cents INTEGER NOT NULL DEFAULT 5000; -- Default R50 per km
    
    RAISE NOTICE '✅ Added price_per_km_cents column to app_settings';
  ELSE
    RAISE NOTICE '⚠️ Column price_per_km_cents already exists in app_settings';
  END IF;
END $$;

-- Update existing app_settings record with default value if needed
UPDATE app_settings
SET price_per_km_cents = 5000
WHERE id = 1 AND price_per_km_cents IS NULL;

