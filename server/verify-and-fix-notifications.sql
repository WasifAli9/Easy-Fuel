-- Quick verification and fix script for notifications table
-- Run this in Supabase Dashboard → SQL Editor

-- Step 1: Check if notifications table exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' 
    AND table_name = 'notifications'
  ) THEN
    RAISE NOTICE 'Notifications table does not exist. Creating it...';
    
    -- Create notification_type enum if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'notification_type') THEN
      CREATE TYPE notification_type AS ENUM (
        'order_created', 'order_awaiting_payment', 'order_paid', 'driver_assigned',
        'driver_en_route', 'driver_arrived', 'delivery_started', 'delivery_complete',
        'order_cancelled', 'order_refunded', 'dispatch_offer_received', 'offer_timeout_warning',
        'offer_expired', 'customer_accepted_offer', 'customer_declined_offer',
        'order_accepted_by_customer', 'pickup_ready', 'delivery_instructions_updated',
        'new_message', 'unread_messages_reminder', 'payment_received', 'payment_failed',
        'payment_processing', 'payout_scheduled', 'payout_completed', 'payout_failed',
        'new_order_for_supplier', 'stock_low', 'stock_critical', 'order_fulfilled',
        'order_ready_for_pickup', 'supplier_rating_received', 'driver_rating_received',
        'shift_reminder', 'document_expiring', 'vehicle_inspection_due',
        'delivery_eta_update', 'driver_location_shared', 'price_estimate_available',
        'favorite_driver_available', 'system_alert', 'account_verification_required',
        'account_approved', 'account_rejected', 'account_suspended', 'terms_updated',
        'maintenance_scheduled'
      );
    END IF;
    
    -- Create notifications table
    CREATE TABLE public.notifications (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id uuid NOT NULL,
      type notification_type NOT NULL,
      title text NOT NULL,
      message text NOT NULL,
      data jsonb,
      read boolean NOT NULL DEFAULT false,
      read_at timestamptz,
      delivery_status text DEFAULT 'pending',
      delivered_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now()
    );
    
    -- Create indexes
    CREATE INDEX notifications_user_id_idx ON public.notifications(user_id);
    CREATE INDEX notifications_read_idx ON public.notifications(read);
    CREATE INDEX notifications_user_read_idx ON public.notifications(user_id, read);
    CREATE INDEX notifications_created_at_idx ON public.notifications(created_at DESC);
    
    -- Grant permissions
    GRANT USAGE ON SCHEMA public TO anon, authenticated;
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.notifications TO anon, authenticated;
    
    -- Enable RLS
    ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
    
    -- Create RLS policies
    DROP POLICY IF EXISTS "Users can view their own notifications" ON public.notifications;
    CREATE POLICY "Users can view their own notifications" 
      ON public.notifications FOR SELECT 
      TO authenticated 
      USING (auth.uid() = user_id);
    
    DROP POLICY IF EXISTS "Users can insert their own notifications" ON public.notifications;
    CREATE POLICY "Users can insert their own notifications" 
      ON public.notifications FOR INSERT 
      TO authenticated 
      WITH CHECK (auth.uid() = user_id);
    
    DROP POLICY IF EXISTS "Users can update their own notifications" ON public.notifications;
    CREATE POLICY "Users can update their own notifications" 
      ON public.notifications FOR UPDATE 
      TO authenticated 
      USING (auth.uid() = user_id)
      WITH CHECK (auth.uid() = user_id);
    
    RAISE NOTICE 'Notifications table created successfully!';
  ELSE
    RAISE NOTICE 'Notifications table already exists.';
  END IF;
END $$;

-- Step 2: Force PostgREST schema cache reload (multiple times to ensure it works)
NOTIFY pgrst, 'reload schema';

-- Step 3: Verify the table exists
SELECT 
  CASE 
    WHEN EXISTS (
      SELECT 1 FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_name = 'notifications'
    ) THEN '✓ Notifications table exists'
    ELSE '✗ Notifications table NOT found'
  END AS status;

-- Step 4: Check table structure
SELECT 
  column_name, 
  data_type, 
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_schema = 'public' 
  AND table_name = 'notifications'
ORDER BY ordinal_position;

-- Step 5: Final schema reload (wait 10 seconds after this before testing)
NOTIFY pgrst, 'reload schema';

-- IMPORTANT: Wait 10-15 seconds after running this script before testing notifications!

