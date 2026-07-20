-- Single platform-wide driver pickup radius (miles), admin-editable. Default 500.
-- Replaces the legacy per-plan radius tiers (standard/extended/unlimited).

ALTER TABLE app_settings
  ADD COLUMN IF NOT EXISTS driver_pickup_radius_miles integer NOT NULL DEFAULT 500;

UPDATE app_settings
SET driver_pickup_radius_miles = COALESCE(driver_pickup_radius_miles, 500)
WHERE id = 1;
