-- Create notifications and push_subscriptions tables
-- Run this in Supabase Dashboard → SQL Editor

-- Step 1: Create notification_type enum if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'notification_type') THEN
    CREATE TYPE notification_type AS ENUM (
      -- Order lifecycle - Customer
      'order_created',
      'order_awaiting_payment',
      'order_paid',
      'driver_assigned',
      'driver_en_route',
      'driver_arrived',
      'delivery_started',
      'delivery_complete',
      'order_cancelled',
      'order_refunded',
      
      -- Dispatch & Offers - Driver
      'dispatch_offer_received',
      'offer_timeout_warning',
      'offer_expired',
      'customer_accepted_offer',
      'customer_declined_offer',
      
      -- Order updates - Driver
      'order_accepted_by_customer',
      'pickup_ready',
      'delivery_instructions_updated',
      
      -- Chat - Both Customer & Driver
      'new_message',
      'unread_messages_reminder',
      
      -- Payment - All roles
      'payment_received',
      'payment_failed',
      'payment_processing',
      'payout_scheduled',
      'payout_completed',
      'payout_failed',
      
      -- Supplier specific
      'new_order_for_supplier',
      'stock_low',
      'stock_critical',
      'order_fulfilled',
      'order_ready_for_pickup',
      'supplier_rating_received',
      
      -- Driver specific
      'driver_rating_received',
      'shift_reminder',
      'document_expiring',
      'vehicle_inspection_due',
      
      -- Customer specific
      'delivery_eta_update',
      'driver_location_shared',
      'price_estimate_available',
      'favorite_driver_available',
      
      -- Driver depot orders
      'driver_depot_order_placed',
      'driver_depot_order_confirmed',
      'driver_depot_order_fulfilled',
      'driver_depot_order_cancelled',
      'driver_depot_order_accepted',
      'driver_depot_order_rejected',
      'driver_depot_payment_verified',
      'driver_depot_payment_rejected',
      'driver_depot_order_released',
      'driver_depot_order_completed',
      
      -- Supplier depot order notifications
      'supplier_depot_order_placed',
      'supplier_payment_received',
      'supplier_signature_required',
      'supplier_order_completed',
      
      -- Admin notifications
      'admin_document_uploaded',
      'admin_kyc_submitted',
      'admin_vehicle_approved',
      'admin_vehicle_rejected',
      'admin_document_approved',
      'admin_document_rejected',
      'admin_kyc_approved',
      'admin_kyc_rejected',
      
      -- System & Admin
      'system_alert',
      'account_verification_required',
      'account_approved',
      'account_rejected',
      'account_suspended',
      'terms_updated',
      'maintenance_scheduled'
    );
  END IF;
END $$;

-- Step 2: Create notifications table if it doesn't exist
CREATE TABLE IF NOT EXISTS public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL, -- References auth.users(id)
  type notification_type NOT NULL,
  title text NOT NULL,
  message text NOT NULL,
  data jsonb, -- Additional data (order_id, driver_id, etc.)
  read boolean NOT NULL DEFAULT false,
  read_at timestamptz,
  delivery_status text DEFAULT 'pending', -- pending, sent, failed
  delivered_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Step 3: Create indexes for notifications table
CREATE INDEX IF NOT EXISTS notifications_user_id_idx ON public.notifications(user_id);
CREATE INDEX IF NOT EXISTS notifications_read_idx ON public.notifications(read);
CREATE INDEX IF NOT EXISTS notifications_user_read_idx ON public.notifications(user_id, read);
CREATE INDEX IF NOT EXISTS notifications_created_at_idx ON public.notifications(created_at DESC);

-- Step 4: Create push_subscriptions table if it doesn't exist
CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL, -- References auth.users(id)
  endpoint text NOT NULL UNIQUE,
  p256dh text NOT NULL,
  auth text NOT NULL,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Step 5: Create index for push_subscriptions table
CREATE INDEX IF NOT EXISTS push_subscriptions_user_id_idx ON public.push_subscriptions(user_id);

-- Step 6: Grant permissions for PostgREST access
GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.notifications TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.push_subscriptions TO anon, authenticated;

-- Step 7: Enable Row Level Security
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

-- Step 8: Create RLS policies for notifications
-- Users can only see their own notifications
DROP POLICY IF EXISTS "Users can view their own notifications" ON public.notifications;
CREATE POLICY "Users can view their own notifications" 
  ON public.notifications FOR SELECT 
  TO authenticated 
  USING (auth.uid() = user_id);

-- Users can insert their own notifications (for system notifications)
DROP POLICY IF EXISTS "Users can insert their own notifications" ON public.notifications;
CREATE POLICY "Users can insert their own notifications" 
  ON public.notifications FOR INSERT 
  TO authenticated 
  WITH CHECK (auth.uid() = user_id);

-- Users can update their own notifications (mark as read)
DROP POLICY IF EXISTS "Users can update their own notifications" ON public.notifications;
CREATE POLICY "Users can update their own notifications" 
  ON public.notifications FOR UPDATE 
  TO authenticated 
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Step 9: Create RLS policies for push_subscriptions
-- Users can only see their own subscriptions
DROP POLICY IF EXISTS "Users can view their own push subscriptions" ON public.push_subscriptions;
CREATE POLICY "Users can view their own push subscriptions" 
  ON public.push_subscriptions FOR SELECT 
  TO authenticated 
  USING (auth.uid() = user_id);

-- Users can insert their own subscriptions
DROP POLICY IF EXISTS "Users can insert their own push subscriptions" ON public.push_subscriptions;
CREATE POLICY "Users can insert their own push subscriptions" 
  ON public.push_subscriptions FOR INSERT 
  TO authenticated 
  WITH CHECK (auth.uid() = user_id);

-- Users can delete their own subscriptions
DROP POLICY IF EXISTS "Users can delete their own push subscriptions" ON public.push_subscriptions;
CREATE POLICY "Users can delete their own push subscriptions" 
  ON public.push_subscriptions FOR DELETE 
  TO authenticated 
  USING (auth.uid() = user_id);

-- Step 10: Trigger PostgREST schema reload
NOTIFY pgrst, 'reload schema';

-- Done! The notifications and push_subscriptions tables should now be available.

