-- Create delivery_addresses table
-- Run this in your Supabase SQL Editor

CREATE TABLE IF NOT EXISTS public.delivery_addresses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  address_street TEXT NOT NULL,
  address_city TEXT NOT NULL,
  address_province TEXT NOT NULL,
  address_postal_code TEXT NOT NULL,
  address_country TEXT NOT NULL DEFAULT 'South Africa',
  lat DOUBLE PRECISION NOT NULL,
  lng DOUBLE PRECISION NOT NULL,
  access_instructions TEXT,
  is_default BOOLEAN NOT NULL DEFAULT false,
  is_verified BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- Add index for customer lookups
CREATE INDEX IF NOT EXISTS idx_delivery_addresses_customer_id 
ON public.delivery_addresses(customer_id);

-- Add index for default address lookups
CREATE INDEX IF NOT EXISTS idx_delivery_addresses_default 
ON public.delivery_addresses(customer_id, is_default) 
WHERE is_default = true;

-- Add delivery_address_id column to orders table if it doesn't exist
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'orders' 
    AND column_name = 'delivery_address_id'
  ) THEN
    ALTER TABLE public.orders 
    ADD COLUMN delivery_address_id UUID REFERENCES public.delivery_addresses(id);
  END IF;
END $$;

-- Grant permissions
GRANT ALL ON public.delivery_addresses TO authenticated;
GRANT ALL ON public.delivery_addresses TO service_role;

-- Success message
SELECT 'delivery_addresses table created successfully!' as result;
