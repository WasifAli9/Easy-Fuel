-- Add new notification types to existing notification_type enum
-- Run this in Supabase Dashboard → SQL Editor if the enum already exists

-- Add new notification types to the enum
DO $$
BEGIN
  -- Driver depot order notifications
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'driver_depot_order_accepted' AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'notification_type')) THEN
    ALTER TYPE notification_type ADD VALUE 'driver_depot_order_accepted';
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'driver_depot_order_rejected' AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'notification_type')) THEN
    ALTER TYPE notification_type ADD VALUE 'driver_depot_order_rejected';
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'driver_depot_payment_verified' AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'notification_type')) THEN
    ALTER TYPE notification_type ADD VALUE 'driver_depot_payment_verified';
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'driver_depot_payment_rejected' AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'notification_type')) THEN
    ALTER TYPE notification_type ADD VALUE 'driver_depot_payment_rejected';
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'driver_depot_order_released' AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'notification_type')) THEN
    ALTER TYPE notification_type ADD VALUE 'driver_depot_order_released';
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'driver_depot_order_completed' AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'notification_type')) THEN
    ALTER TYPE notification_type ADD VALUE 'driver_depot_order_completed';
  END IF;
  
  -- Supplier depot order notifications
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'supplier_depot_order_placed' AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'notification_type')) THEN
    ALTER TYPE notification_type ADD VALUE 'supplier_depot_order_placed';
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'supplier_payment_received' AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'notification_type')) THEN
    ALTER TYPE notification_type ADD VALUE 'supplier_payment_received';
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'supplier_signature_required' AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'notification_type')) THEN
    ALTER TYPE notification_type ADD VALUE 'supplier_signature_required';
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'supplier_order_completed' AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'notification_type')) THEN
    ALTER TYPE notification_type ADD VALUE 'supplier_order_completed';
  END IF;
  
  -- Admin notifications
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'admin_document_uploaded' AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'notification_type')) THEN
    ALTER TYPE notification_type ADD VALUE 'admin_document_uploaded';
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'admin_kyc_submitted' AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'notification_type')) THEN
    ALTER TYPE notification_type ADD VALUE 'admin_kyc_submitted';
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'admin_vehicle_approved' AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'notification_type')) THEN
    ALTER TYPE notification_type ADD VALUE 'admin_vehicle_approved';
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'admin_vehicle_rejected' AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'notification_type')) THEN
    ALTER TYPE notification_type ADD VALUE 'admin_vehicle_rejected';
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'admin_document_approved' AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'notification_type')) THEN
    ALTER TYPE notification_type ADD VALUE 'admin_document_approved';
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'admin_document_rejected' AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'notification_type')) THEN
    ALTER TYPE notification_type ADD VALUE 'admin_document_rejected';
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'admin_kyc_approved' AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'notification_type')) THEN
    ALTER TYPE notification_type ADD VALUE 'admin_kyc_approved';
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'admin_kyc_rejected' AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'notification_type')) THEN
    ALTER TYPE notification_type ADD VALUE 'admin_kyc_rejected';
  END IF;
END $$;

-- Trigger PostgREST schema reload
NOTIFY pgrst, 'reload schema';

