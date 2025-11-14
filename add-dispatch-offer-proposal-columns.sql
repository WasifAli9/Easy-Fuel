-- Extend dispatch_offer_state enum with new states
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_enum
    JOIN pg_type ON pg_enum.enumtypid = pg_type.oid
    WHERE pg_type.typname = 'dispatch_offer_state'
      AND pg_enum.enumlabel = 'pending_customer'
  ) THEN
    ALTER TYPE dispatch_offer_state ADD VALUE 'pending_customer';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_enum
    JOIN pg_type ON pg_enum.enumtypid = pg_type.oid
    WHERE pg_type.typname = 'dispatch_offer_state'
      AND pg_enum.enumlabel = 'customer_accepted'
  ) THEN
    ALTER TYPE dispatch_offer_state ADD VALUE 'customer_accepted';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_enum
    JOIN pg_type ON pg_enum.enumtypid = pg_type.oid
    WHERE pg_type.typname = 'dispatch_offer_state'
      AND pg_enum.enumlabel = 'customer_declined'
  ) THEN
    ALTER TYPE dispatch_offer_state ADD VALUE 'customer_declined';
  END IF;
END $$;

-- Add columns to store driver proposals
ALTER TABLE dispatch_offers
  ADD COLUMN IF NOT EXISTS proposed_delivery_time TIMESTAMP,
  ADD COLUMN IF NOT EXISTS proposed_delivery_fee_cents INTEGER,
  ADD COLUMN IF NOT EXISTS proposed_notes TEXT,
  ADD COLUMN IF NOT EXISTS customer_response_at TIMESTAMP;

-- Refresh PostgREST schema cache
NOTIFY pgrst, 'reload schema';

DO $$
BEGIN
  RAISE NOTICE '✅ Added driver proposal columns to dispatch_offers.';
END $$;

