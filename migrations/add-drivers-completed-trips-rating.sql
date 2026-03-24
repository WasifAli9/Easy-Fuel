-- Matches shared/schema.ts: drivers.completed_trips, drivers.rating
-- Run in Supabase SQL editor if these columns are missing.

ALTER TABLE public.drivers
  ADD COLUMN IF NOT EXISTS completed_trips integer NOT NULL DEFAULT 0;

ALTER TABLE public.drivers
  ADD COLUMN IF NOT EXISTS rating double precision;

COMMENT ON COLUMN public.drivers.completed_trips IS 'Completed delivery count (Drizzle default 0).';
COMMENT ON COLUMN public.drivers.rating IS 'Aggregate driver rating, nullable until set.';
