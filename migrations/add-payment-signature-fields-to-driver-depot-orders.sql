-- Migration: Add payment and signature fields to driver_depot_orders table
-- This enables the complete order flow: payment → signatures → delivery

-- Add payment-related fields
ALTER TABLE public.driver_depot_orders
ADD COLUMN IF NOT EXISTS payment_status VARCHAR(20) DEFAULT 'pending_payment' 
  CHECK (payment_status IN ('pending_payment', 'paid', 'payment_failed', 'payment_verified', 'not_required')),
ADD COLUMN IF NOT EXISTS payment_method VARCHAR(20) 
  CHECK (payment_method IN ('bank_transfer', 'online_payment', 'pay_outside_app') OR payment_method IS NULL),
ADD COLUMN IF NOT EXISTS payment_proof_url TEXT,
ADD COLUMN IF NOT EXISTS payment_confirmed_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS payment_confirmed_by UUID REFERENCES auth.users(id);

-- Add signature fields for agreement before fuel release
ALTER TABLE public.driver_depot_orders
ADD COLUMN IF NOT EXISTS driver_signature_url TEXT,
ADD COLUMN IF NOT EXISTS supplier_signature_url TEXT,
ADD COLUMN IF NOT EXISTS driver_signed_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS supplier_signed_at TIMESTAMPTZ;

-- Add delivery confirmation fields
ALTER TABLE public.driver_depot_orders
ADD COLUMN IF NOT EXISTS actual_litres_delivered NUMERIC,
ADD COLUMN IF NOT EXISTS delivery_signature_url TEXT,
ADD COLUMN IF NOT EXISTS delivery_signed_at TIMESTAMPTZ;

-- Update status enum to include new statuses
-- First, update existing rows to map old statuses to new ones
-- This must happen BEFORE dropping the constraint to avoid constraint violations

-- Now drop the existing constraint
ALTER TABLE public.driver_depot_orders
DROP CONSTRAINT IF EXISTS driver_depot_orders_status_check;

-- Add new constraint with expanded statuses
ALTER TABLE public.driver_depot_orders
ADD CONSTRAINT driver_depot_orders_status_check 
  CHECK (status IN (
    'pending',           -- Order created, waiting for supplier acceptance
    'pending_payment',   -- Supplier accepted, waiting for payment
    'paid',              -- Payment completed, waiting for signatures
    'ready_for_pickup',  -- Both parties signed, ready to release fuel
    'released',          -- Supplier released fuel, waiting for driver pickup
    'completed',         -- Driver received and signed, order complete
    'cancelled',         -- Order cancelled
    'rejected'           -- Supplier rejected the order
  ));

-- Set default payment_status for existing orders (after status migration)
UPDATE public.driver_depot_orders
SET payment_status = CASE 
  WHEN status = 'pending' THEN 'pending_payment'
  WHEN status = 'paid' OR status = 'completed' THEN 'paid'
  WHEN status = 'cancelled' OR status = 'rejected' THEN 'not_required'
  ELSE 'pending_payment'
END
WHERE payment_status IS NULL;

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_driver_depot_orders_payment_status 
  ON public.driver_depot_orders(payment_status);
CREATE INDEX IF NOT EXISTS idx_driver_depot_orders_payment_method 
  ON public.driver_depot_orders(payment_method);
CREATE INDEX IF NOT EXISTS idx_driver_depot_orders_driver_signed 
  ON public.driver_depot_orders(driver_signed_at) WHERE driver_signed_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_driver_depot_orders_supplier_signed 
  ON public.driver_depot_orders(supplier_signed_at) WHERE supplier_signed_at IS NOT NULL;

-- Add comments for documentation
COMMENT ON COLUMN public.driver_depot_orders.payment_status IS 'Payment status: pending_payment, paid, payment_failed, payment_verified, not_required';
COMMENT ON COLUMN public.driver_depot_orders.payment_method IS 'Payment method: bank_transfer, online_payment, pay_outside_app';
COMMENT ON COLUMN public.driver_depot_orders.payment_proof_url IS 'URL to proof of payment document (for bank transfer)';
COMMENT ON COLUMN public.driver_depot_orders.driver_signature_url IS 'URL to driver signature image (before fuel release)';
COMMENT ON COLUMN public.driver_depot_orders.supplier_signature_url IS 'URL to supplier signature image (before fuel release)';
COMMENT ON COLUMN public.driver_depot_orders.actual_litres_delivered IS 'Actual litres handed over (may differ from ordered litres)';
COMMENT ON COLUMN public.driver_depot_orders.delivery_signature_url IS 'URL to driver signature image (on receipt of fuel)';

