-- Add radius preference and location fields to drivers table
-- This enables drivers to set their job pickup radius preference

-- Add job radius preference column (default 20 miles)
ALTER TABLE drivers 
ADD COLUMN IF NOT EXISTS job_radius_preference_miles DOUBLE PRECISION DEFAULT 20;

-- Add current location columns for driver
ALTER TABLE drivers 
ADD COLUMN IF NOT EXISTS current_lat DOUBLE PRECISION;

ALTER TABLE drivers 
ADD COLUMN IF NOT EXISTS current_lng DOUBLE PRECISION;

-- Add comment explaining the columns
COMMENT ON COLUMN drivers.job_radius_preference_miles IS 'Maximum distance (in miles) a driver is willing to travel to pick up a job. Default is 20 miles.';
COMMENT ON COLUMN drivers.current_lat IS 'Driver current or home location latitude for distance-based job filtering';
COMMENT ON COLUMN drivers.current_lng IS 'Driver current or home location longitude for distance-based job filtering';

-- Notify PostgREST to reload schema cache
NOTIFY pgrst, 'reload schema';
