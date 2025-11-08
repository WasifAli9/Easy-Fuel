-- Create driver_pricing and pricing_history tables in Supabase
-- Run this in Supabase Dashboard → SQL Editor

-- Create driver_pricing table
CREATE TABLE IF NOT EXISTS public.driver_pricing (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id uuid NOT NULL REFERENCES public.drivers(id) ON DELETE CASCADE,
  fuel_type_id uuid NOT NULL REFERENCES public.fuel_types(id) ON DELETE CASCADE,
  delivery_fee_cents integer NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(driver_id, fuel_type_id)
);

-- Create pricing_history table  
CREATE TABLE IF NOT EXISTS public.pricing_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type varchar(20) NOT NULL CHECK (entity_type IN ('driver', 'supplier')),
  entity_id uuid NOT NULL,
  fuel_type_id uuid NOT NULL REFERENCES public.fuel_types(id) ON DELETE CASCADE,
  old_price_cents integer,
  new_price_cents integer NOT NULL,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Grant permissions for PostgREST access
GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.driver_pricing TO anon, authenticated;
GRANT SELECT, INSERT ON TABLE public.pricing_history TO anon, authenticated;

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_driver_pricing_driver_id ON public.driver_pricing(driver_id);
CREATE INDEX IF NOT EXISTS idx_driver_pricing_fuel_type_id ON public.driver_pricing(fuel_type_id);
CREATE INDEX IF NOT EXISTS idx_pricing_history_entity ON public.pricing_history(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_pricing_history_fuel_type ON public.pricing_history(fuel_type_id);

-- Enable Row Level Security (optional but recommended)
ALTER TABLE public.driver_pricing ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pricing_history ENABLE ROW LEVEL SECURITY;

-- Create RLS policies (adjust as needed for your security requirements)
-- Allow authenticated users to read all pricing
CREATE POLICY "Allow read access to all authenticated users" 
  ON public.driver_pricing FOR SELECT 
  TO authenticated 
  USING (true);

CREATE POLICY "Allow read access to pricing history" 
  ON public.pricing_history FOR SELECT 
  TO authenticated 
  USING (true);

-- Trigger PostgREST schema reload
NOTIFY pgrst, 'reload schema';
