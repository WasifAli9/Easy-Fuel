-- Migration: Update pricing columns to reflect new pricing model
-- Driver pricing: fuel_price_per_liter_cents (instead of delivery_fee_cents)
-- Dispatch offers: proposed_price_per_km_cents (instead of proposed_delivery_fee_cents)

-- Step 1: Update driver_pricing table
DO $$
BEGIN
  -- Check if column exists and rename it
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public'
    AND table_name = 'driver_pricing' 
    AND column_name = 'delivery_fee_cents'
  ) THEN
    ALTER TABLE public.driver_pricing 
    RENAME COLUMN delivery_fee_cents TO fuel_price_per_liter_cents;
    
    RAISE NOTICE '✅ Renamed delivery_fee_cents to fuel_price_per_liter_cents in driver_pricing';
  ELSIF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public'
    AND table_name = 'driver_pricing' 
    AND column_name = 'fuel_price_per_liter_cents'
  ) THEN
    -- Column doesn't exist at all, add it
    ALTER TABLE public.driver_pricing 
    ADD COLUMN fuel_price_per_liter_cents INTEGER;
    
    -- Copy data from old column if it exists with a different name
    RAISE NOTICE '✅ Added fuel_price_per_liter_cents column to driver_pricing';
  ELSE
    RAISE NOTICE '⚠️ Column fuel_price_per_liter_cents already exists in driver_pricing';
  END IF;
END $$;

-- Step 2: Update dispatch_offers table
DO $$
BEGIN
  -- Check if old column exists and rename it
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public'
    AND table_name = 'dispatch_offers' 
    AND column_name = 'proposed_delivery_fee_cents'
  ) THEN
    ALTER TABLE public.dispatch_offers 
    RENAME COLUMN proposed_delivery_fee_cents TO proposed_price_per_km_cents;
    
    RAISE NOTICE '✅ Renamed proposed_delivery_fee_cents to proposed_price_per_km_cents in dispatch_offers';
  ELSIF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public'
    AND table_name = 'dispatch_offers' 
    AND column_name = 'proposed_price_per_km_cents'
  ) THEN
    -- Column doesn't exist at all, add it
    ALTER TABLE public.dispatch_offers 
    ADD COLUMN proposed_price_per_km_cents INTEGER;
    
    RAISE NOTICE '✅ Added proposed_price_per_km_cents column to dispatch_offers';
  ELSE
    RAISE NOTICE '⚠️ Column proposed_price_per_km_cents already exists in dispatch_offers';
  END IF;
END $$;

-- Refresh PostgREST schema cache
NOTIFY pgrst, 'reload schema';

-- Success message
DO $$
BEGIN
  RAISE NOTICE '✅ Pricing columns updated successfully. PostgREST schema cache reloaded.';
  RAISE NOTICE '⚠️ Please wait 5-10 seconds for the schema cache to refresh before using the API.';
END $$;

