-- Add driver depot order notification types to the notification_type enum
-- Run this in your Supabase SQL Editor

-- Add new notification types to the enum
DO $$
BEGIN
  -- Add driver_depot_order_placed
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum 
    WHERE enumlabel = 'driver_depot_order_placed' 
    AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'notification_type')
  ) THEN
    ALTER TYPE notification_type ADD VALUE 'driver_depot_order_placed';
  END IF;

  -- Add driver_depot_order_confirmed
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum 
    WHERE enumlabel = 'driver_depot_order_confirmed' 
    AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'notification_type')
  ) THEN
    ALTER TYPE notification_type ADD VALUE 'driver_depot_order_confirmed';
  END IF;

  -- Add driver_depot_order_fulfilled
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum 
    WHERE enumlabel = 'driver_depot_order_fulfilled' 
    AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'notification_type')
  ) THEN
    ALTER TYPE notification_type ADD VALUE 'driver_depot_order_fulfilled';
  END IF;

  -- Add driver_depot_order_cancelled
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum 
    WHERE enumlabel = 'driver_depot_order_cancelled' 
    AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'notification_type')
  ) THEN
    ALTER TYPE notification_type ADD VALUE 'driver_depot_order_cancelled';
  END IF;
END $$;

-- Trigger PostgREST schema reload
NOTIFY pgrst, 'reload schema';

