-- One-time patch: extend public.notification_type for depot + admin notification rows.
-- Safe to re-run: skips labels that already exist.

DO $patch$
DECLARE
  lbl text;
  labels text[] := ARRAY[
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
    'supplier_depot_order_placed',
    'supplier_payment_received',
    'supplier_signature_required',
    'supplier_order_completed',
    'admin_document_uploaded',
    'admin_kyc_submitted',
    'admin_vehicle_review_required',
    'admin_vehicle_approved',
    'admin_vehicle_rejected',
    'admin_document_approved',
    'admin_document_rejected',
    'admin_kyc_approved',
    'admin_kyc_rejected'
  ];
BEGIN
  FOREACH lbl IN ARRAY labels
  LOOP
    IF NOT EXISTS (
      SELECT 1
      FROM pg_enum e
      JOIN pg_type t ON e.enumtypid = t.oid
      JOIN pg_namespace n ON n.oid = t.typnamespace
      WHERE n.nspname = 'public'
        AND t.typname = 'notification_type'
        AND e.enumlabel = lbl
    ) THEN
      EXECUTE format('ALTER TYPE public.notification_type ADD VALUE %L', lbl);
    END IF;
  END LOOP;
END
$patch$;
