-- Add pickup_date column to driver_depot_orders table
-- This allows drivers to specify when they will pick up fuel from the supplier's depot
-- Run this in your Supabase SQL Editor

ALTER TABLE driver_depot_orders 
ADD COLUMN IF NOT EXISTS pickup_date TIMESTAMP;

-- Add comment for documentation
COMMENT ON COLUMN driver_depot_orders.pickup_date IS 'Date and time when the driver will pick up the fuel from the depot';

-- Trigger PostgREST schema reload
NOTIFY pgrst, 'reload schema';

