-- Create location_source enum if not exists (for driver_locations.source)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type t
                 JOIN pg_namespace n ON n.oid = t.typnamespace
                 WHERE t.typname = 'location_source' AND n.nspname = 'public') THEN
    CREATE TYPE public.location_source AS ENUM ('gps', 'network', 'manual');
  END IF;
END
$$;

-- Create driver_locations table for GPS tracking history
CREATE TABLE IF NOT EXISTS public.driver_locations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id uuid NOT NULL REFERENCES public.drivers(id),
  order_id uuid REFERENCES public.orders(id),
  lat double precision NOT NULL,
  lng double precision NOT NULL,
  accuracy double precision,
  heading double precision,
  speed double precision,
  source location_source NOT NULL DEFAULT 'gps',
  is_current boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS driver_locations_driver_id_idx ON public.driver_locations(driver_id);
CREATE INDEX IF NOT EXISTS driver_locations_order_id_idx ON public.driver_locations(order_id);
CREATE INDEX IF NOT EXISTS driver_locations_created_at_idx ON public.driver_locations(created_at);

COMMENT ON TABLE public.driver_locations IS 'GPS tracking history for drivers; used for real-time tracking and location history';
