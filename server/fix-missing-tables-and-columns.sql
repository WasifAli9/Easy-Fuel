-- Comprehensive fix for missing tables and columns
-- Run this entire script in Supabase SQL Editor

-- Step 1: Add missing columns to drivers table if they don't exist
DO $$
BEGIN
  -- Add job_radius_preference_miles column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'drivers' AND column_name = 'job_radius_preference_miles'
  ) THEN
    ALTER TABLE drivers ADD COLUMN job_radius_preference_miles DOUBLE PRECISION DEFAULT 20;
  END IF;

  -- Add current_lat column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'drivers' AND column_name = 'current_lat'
  ) THEN
    ALTER TABLE drivers ADD COLUMN current_lat DOUBLE PRECISION;
  END IF;

  -- Add current_lng column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'drivers' AND column_name = 'current_lng'
  ) THEN
    ALTER TABLE drivers ADD COLUMN current_lng DOUBLE PRECISION;
  END IF;
END $$;

-- Step 2: Create vehicles table if it doesn't exist
CREATE TABLE IF NOT EXISTS vehicles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id UUID NOT NULL REFERENCES drivers(id) ON DELETE CASCADE,
  registration_number TEXT NOT NULL,
  make TEXT,
  model TEXT,
  year INTEGER,
  capacity_litres INTEGER,
  fuel_types TEXT[], -- Array of fuel type codes
  license_disk_expiry TIMESTAMP,
  roadworthy_expiry TIMESTAMP,
  insurance_expiry TIMESTAMP,
  tracker_installed BOOLEAN DEFAULT false,
  tracker_provider TEXT,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP DEFAULT NOW() NOT NULL
);

-- Step 3: Create index on driver_id for faster queries
CREATE INDEX IF NOT EXISTS idx_vehicles_driver_id ON vehicles(driver_id);

-- Step 4: Create driver_pricing table if it doesn't exist
CREATE TABLE IF NOT EXISTS driver_pricing (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id UUID NOT NULL REFERENCES drivers(id) ON DELETE CASCADE,
  fuel_type_id UUID NOT NULL REFERENCES fuel_types(id) ON DELETE CASCADE,
  delivery_fee_cents INTEGER NOT NULL, -- Driver's fee for delivering this fuel type
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP DEFAULT NOW() NOT NULL,
  UNIQUE(driver_id, fuel_type_id) -- One price per driver per fuel type
);

-- Step 5: Create index on driver_pricing for faster queries
CREATE INDEX IF NOT EXISTS idx_driver_pricing_driver_id ON driver_pricing(driver_id);
CREATE INDEX IF NOT EXISTS idx_driver_pricing_fuel_type_id ON driver_pricing(fuel_type_id);

-- Step 6: Create pricing_history table if it doesn't exist
CREATE TABLE IF NOT EXISTS pricing_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type TEXT NOT NULL, -- "driver" or "depot"
  entity_id UUID NOT NULL, -- driver_id or depot_id
  fuel_type_id UUID NOT NULL REFERENCES fuel_types(id),
  old_price_cents INTEGER, -- NULL for initial pricing
  new_price_cents INTEGER NOT NULL,
  changed_by UUID NOT NULL, -- user_id who made the change
  notes TEXT,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL
);

-- Step 7: Create indexes on pricing_history for faster queries
CREATE INDEX IF NOT EXISTS idx_pricing_history_entity ON pricing_history(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_pricing_history_fuel_type_id ON pricing_history(fuel_type_id);
CREATE INDEX IF NOT EXISTS idx_pricing_history_created_at ON pricing_history(created_at DESC);

-- Step 8: Refresh PostgREST schema cache
NOTIFY pgrst, 'reload schema';

-- Done! Wait 10 seconds and:
-- 1. Try adding a vehicle (Vehicles tab should work)
-- 2. Try setting pricing (Pricing tab should work)
-- 3. Check history (History button in Pricing tab should work)
