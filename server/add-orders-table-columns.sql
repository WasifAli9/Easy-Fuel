-- Add missing columns to orders table
-- Run this in your Supabase SQL Editor (https://supabase.com/dashboard → SQL Editor)
-- This fixes the "Could not find the 'access_instructions' column" error

-- First ensure priority_level enum type exists (safe if already exists)
DO $$ BEGIN
  CREATE TYPE priority_level AS ENUM ('low', 'medium', 'high', 'urgent');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Add delivery and order management columns to orders table
ALTER TABLE orders 
ADD COLUMN IF NOT EXISTS access_instructions TEXT,
ADD COLUMN IF NOT EXISTS delivery_date TIMESTAMP,
ADD COLUMN IF NOT EXISTS from_time TIMESTAMP,
ADD COLUMN IF NOT EXISTS to_time TIMESTAMP,
ADD COLUMN IF NOT EXISTS vehicle_registration TEXT,
ADD COLUMN IF NOT EXISTS equipment_type TEXT,
ADD COLUMN IF NOT EXISTS tank_capacity NUMERIC,
ADD COLUMN IF NOT EXISTS terms_accepted_at TIMESTAMP,
ADD COLUMN IF NOT EXISTS signature_data TEXT,
ADD COLUMN IF NOT EXISTS confirmed_delivery_time TIMESTAMP,
ADD COLUMN IF NOT EXISTS paid_at TIMESTAMP,
ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMP;

-- Add columns with NOT NULL constraints and defaults
DO $$ 
BEGIN
  -- priority_level with enum type and default
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'orders' AND column_name = 'priority_level') THEN
    ALTER TABLE orders ADD COLUMN priority_level priority_level NOT NULL DEFAULT 'medium';
  END IF;
  
  -- terms_accepted with boolean default
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'orders' AND column_name = 'terms_accepted') THEN
    ALTER TABLE orders ADD COLUMN terms_accepted BOOLEAN NOT NULL DEFAULT false;
  END IF;
END $$;

-- Add UUID foreign key columns (without FK constraints for now to avoid dependency issues)
ALTER TABLE orders
ADD COLUMN IF NOT EXISTS payment_method_id UUID,
ADD COLUMN IF NOT EXISTS selected_depot_id UUID,
ADD COLUMN IF NOT EXISTS assigned_driver_id UUID;

-- Add comments for documentation
COMMENT ON COLUMN orders.access_instructions IS 'Delivery access instructions (gate codes, parking, contact person)';
COMMENT ON COLUMN orders.delivery_date IS 'Preferred delivery date selected by customer';
COMMENT ON COLUMN orders.from_time IS 'Delivery time window start';
COMMENT ON COLUMN orders.to_time IS 'Delivery time window end';
COMMENT ON COLUMN orders.priority_level IS 'Order priority: low, medium, high, urgent';
COMMENT ON COLUMN orders.vehicle_registration IS 'Customer vehicle registration number';
COMMENT ON COLUMN orders.equipment_type IS 'Type of equipment being refueled';
COMMENT ON COLUMN orders.tank_capacity IS 'Tank capacity in litres';
COMMENT ON COLUMN orders.payment_method_id IS 'Reference to payment method';
COMMENT ON COLUMN orders.terms_accepted IS 'Customer accepted terms and conditions';
COMMENT ON COLUMN orders.terms_accepted_at IS 'Timestamp when terms were accepted';
COMMENT ON COLUMN orders.signature_data IS 'Base64 encoded customer signature';
COMMENT ON COLUMN orders.selected_depot_id IS 'Selected fuel depot';
COMMENT ON COLUMN orders.assigned_driver_id IS 'Assigned driver for delivery';
COMMENT ON COLUMN orders.confirmed_delivery_time IS 'Driver-confirmed delivery time';
COMMENT ON COLUMN orders.paid_at IS 'Payment completion timestamp';
COMMENT ON COLUMN orders.delivered_at IS 'Delivery completion timestamp';

-- Refresh the PostgREST schema cache so the API can see the new columns
NOTIFY pgrst, 'reload schema';

-- Success message
DO $$
BEGIN
  RAISE NOTICE 'Successfully added missing columns to orders table!';
  RAISE NOTICE 'Columns added: access_instructions, delivery_date, from_time, to_time, priority_level, vehicle_registration, equipment_type, tank_capacity, payment_method_id, terms_accepted, terms_accepted_at, signature_data, selected_depot_id, assigned_driver_id, confirmed_delivery_time, paid_at, delivered_at';
  RAISE NOTICE 'Schema cache refreshed. Order creation should now work correctly.';
END $$;
