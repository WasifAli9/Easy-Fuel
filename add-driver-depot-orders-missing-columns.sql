-- Add missing columns to driver_depot_orders table
-- Run this in Supabase Dashboard → SQL Editor
-- This fixes the "Could not find the 'completed_at' column" error and other missing columns

-- Add completed_at column
ALTER TABLE public.driver_depot_orders
ADD COLUMN IF NOT EXISTS completed_at timestamptz;

-- Add signature columns
ALTER TABLE public.driver_depot_orders
ADD COLUMN IF NOT EXISTS driver_signature_url text,
ADD COLUMN IF NOT EXISTS driver_signed_at timestamptz,
ADD COLUMN IF NOT EXISTS supplier_signature_url text,
ADD COLUMN IF NOT EXISTS supplier_signed_at timestamptz,
ADD COLUMN IF NOT EXISTS delivery_signature_url text,
ADD COLUMN IF NOT EXISTS delivery_signed_at timestamptz;

-- Add payment-related columns
ALTER TABLE public.driver_depot_orders
ADD COLUMN IF NOT EXISTS payment_status varchar(50),
ADD COLUMN IF NOT EXISTS payment_method varchar(50),
ADD COLUMN IF NOT EXISTS payment_proof_url text,
ADD COLUMN IF NOT EXISTS payment_confirmed_at timestamptz,
ADD COLUMN IF NOT EXISTS payment_confirmed_by uuid,
ADD COLUMN IF NOT EXISTS payment_rejection_reason text;

-- Add other order management columns
ALTER TABLE public.driver_depot_orders
ADD COLUMN IF NOT EXISTS actual_litres_delivered numeric,
ADD COLUMN IF NOT EXISTS customer_name text,
ADD COLUMN IF NOT EXISTS customer_signature_url text;

-- Add comments for documentation
COMMENT ON COLUMN public.driver_depot_orders.completed_at IS 'Timestamp when order was completed';
COMMENT ON COLUMN public.driver_depot_orders.driver_signature_url IS 'URL to driver signature image';
COMMENT ON COLUMN public.driver_depot_orders.delivery_signature_url IS 'URL to delivery confirmation signature';
COMMENT ON COLUMN public.driver_depot_orders.payment_status IS 'Payment status: pending_payment, paid, payment_failed, payment_verified, not_required';
COMMENT ON COLUMN public.driver_depot_orders.payment_method IS 'Payment method: bank_transfer, pay_outside_app, etc.';

-- Refresh the PostgREST schema cache so the API can see the new columns
NOTIFY pgrst, 'reload schema';

-- Success message
DO $$
BEGIN
  RAISE NOTICE 'Successfully added missing columns to driver_depot_orders table!';
  RAISE NOTICE 'Columns added: completed_at, driver_signature_url, delivery_signature_url, payment_status, payment_method, and others';
  RAISE NOTICE 'Schema cache refreshed. Order completion should now work correctly.';
END $$;

