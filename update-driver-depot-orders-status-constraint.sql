-- Update driver_depot_orders status CHECK constraint to include all statuses used in the application
-- Run this in Supabase Dashboard → SQL Editor

-- First, drop the existing constraint
ALTER TABLE public.driver_depot_orders 
DROP CONSTRAINT IF EXISTS driver_depot_orders_status_check;

-- Add the new constraint with all allowed statuses
ALTER TABLE public.driver_depot_orders 
ADD CONSTRAINT driver_depot_orders_status_check 
CHECK (status IN (
  'pending',
  'confirmed',
  'fulfilled',
  'cancelled',
  'pending_payment',
  'paid',
  'ready_for_pickup',
  'awaiting_signature',
  'released',
  'completed',
  'rejected'
));

-- Also increase the varchar length to accommodate longer status names (if needed)
-- The current varchar(20) should be sufficient for all these statuses
-- 'awaiting_signature' is 19 characters, which fits within varchar(20)

-- Verify the constraint was added
SELECT 
  conname AS constraint_name,
  pg_get_constraintdef(oid) AS constraint_definition
FROM pg_constraint
WHERE conrelid = 'public.driver_depot_orders'::regclass
  AND conname = 'driver_depot_orders_status_check';

