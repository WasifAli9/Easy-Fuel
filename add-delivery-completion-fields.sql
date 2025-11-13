-- Add columns to store proof of delivery signature details
ALTER TABLE orders
ADD COLUMN IF NOT EXISTS delivery_signature_data TEXT,
ADD COLUMN IF NOT EXISTS delivery_signature_name TEXT,
ADD COLUMN IF NOT EXISTS delivery_signed_at TIMESTAMP;

-- Refresh PostgREST schema cache so API picks up the new columns
NOTIFY pgrst, 'reload schema';

DO $$
BEGIN
  RAISE NOTICE '✅ Added delivery signature columns (delivery_signature_data, delivery_signature_name, delivery_signed_at) to orders table.';
END $$;

