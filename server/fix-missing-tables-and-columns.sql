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

-- Step 4: Refresh PostgREST schema cache
NOTIFY pgrst, 'reload schema';

-- Done! Wait 10 seconds and try adding a vehicle again.
