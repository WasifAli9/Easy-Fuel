-- Aligns with shared/schema.ts: driverAvailabilityEnum + drivers.availability_status
-- Run in Supabase SQL editor (or psql) if the column is missing.

DO $$
BEGIN
  CREATE TYPE public.driver_availability AS ENUM (
    'offline',
    'available',
    'on_delivery',
    'unavailable'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE public.drivers
  ADD COLUMN IF NOT EXISTS availability_status public.driver_availability NOT NULL DEFAULT 'offline';

COMMENT ON COLUMN public.drivers.availability_status IS 'Driver app presence / job state (matches Drizzle driverAvailabilityEnum).';
