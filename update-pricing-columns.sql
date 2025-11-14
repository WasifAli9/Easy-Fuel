-- Migration: Update pricing columns to reflect new pricing model
-- Driver pricing: fuel_price_per_liter_cents (instead of delivery_fee_cents)
-- Dispatch offers: proposed_price_per_km_cents (instead of proposed_delivery_fee_cents)

-- Step 1: Update driver_pricing table
DO $$
BEGIN
  -- Check if column exists and rename it
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'driver_pricing' 
    AND column_name = 'delivery_fee_cents'
  ) THEN
    ALTER TABLE driver_pricing 
    RENAME COLUMN delivery_fee_cents TO fuel_price_per_liter_cents;
    
    RAISE NOTICE '✅ Renamed delivery_fee_cents to fuel_price_per_liter_cents in driver_pricing';
  ELSE
    RAISE NOTICE '⚠️ Column delivery_fee_cents not found in driver_pricing (may already be renamed)';
  END IF;
END $$;

-- Step 2: Update dispatch_offers table
DO $$
BEGIN
  -- Check if column exists and rename it
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'dispatch_offers' 
    AND column_name = 'proposed_delivery_fee_cents'
  ) THEN
    ALTER TABLE dispatch_offers 
    RENAME COLUMN proposed_delivery_fee_cents TO proposed_price_per_km_cents;
    
    RAISE NOTICE '✅ Renamed proposed_delivery_fee_cents to proposed_price_per_km_cents in dispatch_offers';
  ELSE
    RAISE NOTICE '⚠️ Column proposed_delivery_fee_cents not found in dispatch_offers (may already be renamed)';
  END IF;
END $$;

-- Step 3: Update pricing_history table (if it references old column names)
-- Note: pricing_history stores old_price_cents and new_price_cents which are generic,
-- so no changes needed there

-- Refresh PostgREST schema cache
NOTIFY pgrst, 'reload schema';

-- Success message
DO $$
BEGIN
  RAISE NOTICE '✅ Pricing columns updated successfully. PostgREST schema cache reloaded.';
END $$;

