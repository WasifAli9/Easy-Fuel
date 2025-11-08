-- Grant permissions for driver_pricing and pricing_history tables
-- Run this in Supabase Dashboard → SQL Editor

-- Grant USAGE on schema public to Supabase roles
GRANT USAGE ON SCHEMA public TO anon, authenticated;

-- Grant SELECT on driver_pricing table
GRANT SELECT ON TABLE public.driver_pricing TO anon, authenticated;

-- Grant SELECT on pricing_history table
GRANT SELECT ON TABLE public.pricing_history TO anon, authenticated;

-- Set default privileges for future tables (optional but recommended)
ALTER DEFAULT PRIVILEGES IN SCHEMA public 
GRANT SELECT ON TABLES TO anon, authenticated;

-- Trigger PostgREST schema reload
NOTIFY pgrst, 'reload schema';
