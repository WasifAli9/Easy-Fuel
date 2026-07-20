-- Single platform-wide driver pickup radius (miles), admin-editable. Default 500.
-- Run against the app database if drizzle push has not already added this column.

ALTER TABLE app_settings
  ADD COLUMN IF NOT EXISTS driver_pickup_radius_miles integer NOT NULL DEFAULT 500;

UPDATE app_settings
SET driver_pickup_radius_miles = COALESCE(driver_pickup_radius_miles, 500)
WHERE id = 1;
