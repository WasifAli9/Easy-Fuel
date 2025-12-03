-- Create driver_depot_orders table for drivers to order fuel from supplier depots
-- Run this in Supabase Dashboard → SQL Editor

-- Create driver_depot_orders table
CREATE TABLE IF NOT EXISTS public.driver_depot_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id uuid NOT NULL REFERENCES public.drivers(id) ON DELETE CASCADE,
  depot_id uuid NOT NULL REFERENCES public.depots(id) ON DELETE CASCADE,
  fuel_type_id uuid NOT NULL REFERENCES public.fuel_types(id) ON DELETE CASCADE,
  litres numeric NOT NULL,
  price_per_litre_cents integer NOT NULL,
  total_price_cents integer NOT NULL,
  status varchar(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'fulfilled', 'cancelled')),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_driver_depot_orders_driver_id ON public.driver_depot_orders(driver_id);
CREATE INDEX IF NOT EXISTS idx_driver_depot_orders_depot_id ON public.driver_depot_orders(depot_id);
CREATE INDEX IF NOT EXISTS idx_driver_depot_orders_status ON public.driver_depot_orders(status);
CREATE INDEX IF NOT EXISTS idx_driver_depot_orders_created_at ON public.driver_depot_orders(created_at DESC);

-- Grant permissions for PostgREST access
GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.driver_depot_orders TO anon, authenticated;

-- Enable Row Level Security (optional but recommended)
ALTER TABLE public.driver_depot_orders ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
-- Allow drivers to read their own orders
CREATE POLICY "Drivers can read their own depot orders" 
  ON public.driver_depot_orders FOR SELECT 
  TO authenticated 
  USING (
    driver_id IN (
      SELECT id FROM public.drivers WHERE user_id = auth.uid()
    )
  );

-- Allow drivers to create their own orders
CREATE POLICY "Drivers can create their own depot orders" 
  ON public.driver_depot_orders FOR INSERT 
  TO authenticated 
  WITH CHECK (
    driver_id IN (
      SELECT id FROM public.drivers WHERE user_id = auth.uid()
    )
  );

-- Allow drivers to update their own pending orders
CREATE POLICY "Drivers can update their own pending orders" 
  ON public.driver_depot_orders FOR UPDATE 
  TO authenticated 
  USING (
    driver_id IN (
      SELECT id FROM public.drivers WHERE user_id = auth.uid()
    ) AND status = 'pending'
  );

-- Allow suppliers to read orders for their depots
CREATE POLICY "Suppliers can read orders for their depots" 
  ON public.driver_depot_orders FOR SELECT 
  TO authenticated 
  USING (
    depot_id IN (
      SELECT d.id FROM public.depots d
      INNER JOIN public.suppliers s ON d.supplier_id = s.id
      WHERE s.owner_id = auth.uid()
    )
  );

-- Allow suppliers to update orders for their depots (confirm/fulfill)
CREATE POLICY "Suppliers can update orders for their depots" 
  ON public.driver_depot_orders FOR UPDATE 
  TO authenticated 
  USING (
    depot_id IN (
      SELECT d.id FROM public.depots d
      INNER JOIN public.suppliers s ON d.supplier_id = s.id
      WHERE s.owner_id = auth.uid()
    )
  );

-- Trigger PostgREST schema reload
NOTIFY pgrst, 'reload schema';

