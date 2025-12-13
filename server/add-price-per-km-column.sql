-- Add price_per_km_cents column to app_settings table if it doesn't exist
-- Run this in Supabase SQL Editor

DO $$
BEGIN
  -- Add price_per_km_cents column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'app_settings' AND column_name = 'price_per_km_cents'
  ) THEN
    ALTER TABLE app_settings ADD COLUMN price_per_km_cents INTEGER DEFAULT 5000 NOT NULL;
    COMMENT ON COLUMN app_settings.price_per_km_cents IS 'Delivery fee per kilometer in cents (default: 5000 = R50.00 per km)';
  END IF;
END $$;

-- Update existing row if it exists, or create default row
INSERT INTO app_settings (id, price_per_km_cents, updated_at)
VALUES (1, 5000, NOW())
ON CONFLICT (id) 
DO UPDATE SET 
  price_per_km_cents = COALESCE(app_settings.price_per_km_cents, 5000),
  updated_at = NOW()
WHERE app_settings.price_per_km_cents IS NULL;

-- Refresh PostgREST schema cache
NOTIFY pgrst, 'reload schema';

