-- Add driver subscription radius limits to app_settings (admin-editable)
-- Defaults: Standard 200 mi, Extended 500 mi, Unlimited 999 mi

ALTER TABLE public.app_settings
  ADD COLUMN IF NOT EXISTS driver_radius_standard_miles integer DEFAULT 200,
  ADD COLUMN IF NOT EXISTS driver_radius_extended_miles integer DEFAULT 500,
  ADD COLUMN IF NOT EXISTS driver_radius_unlimited_miles integer DEFAULT 999;

UPDATE public.app_settings
SET
  driver_radius_standard_miles = COALESCE(driver_radius_standard_miles, 200),
  driver_radius_extended_miles = COALESCE(driver_radius_extended_miles, 500),
  driver_radius_unlimited_miles = COALESCE(driver_radius_unlimited_miles, 999)
WHERE id = 1;

COMMENT ON COLUMN public.app_settings.driver_radius_standard_miles IS 'Max job pickup radius (miles) for Starter plan';
COMMENT ON COLUMN public.app_settings.driver_radius_extended_miles IS 'Max job pickup radius (miles) for Professional plan';
COMMENT ON COLUMN public.app_settings.driver_radius_unlimited_miles IS 'Max job pickup radius (miles) for Premium plan';
