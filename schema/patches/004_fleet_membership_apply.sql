-- Fleet membership apply/approve + active vehicle + order attribution

DO $patch$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'fleet_membership_status') THEN
    CREATE TYPE public.fleet_membership_status AS ENUM ('none', 'pending', 'approved', 'rejected');
  END IF;
END
$patch$;

ALTER TABLE driver_company_memberships
  ADD COLUMN IF NOT EXISTS membership_status public.fleet_membership_status NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS work_independent boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS applied_at timestamp,
  ADD COLUMN IF NOT EXISTS reviewed_at timestamp,
  ADD COLUMN IF NOT EXISTS reviewed_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS rejection_reason text;

UPDATE driver_company_memberships
SET membership_status = 'approved',
    work_independent = true
WHERE company_id IS NOT NULL
  AND (membership_status IS NULL OR membership_status::text = 'none');

ALTER TABLE drivers
  ADD COLUMN IF NOT EXISTS active_vehicle_id uuid REFERENCES vehicles(id) ON DELETE SET NULL;

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS fleet_company_id uuid REFERENCES companies(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS vehicle_id uuid REFERENCES vehicles(id) ON DELETE SET NULL;

-- Notification types for fleet join flow
DO $patch$
DECLARE
  lbl text;
  labels text[] := ARRAY[
    'fleet_join_application',
    'fleet_join_approved',
    'fleet_join_rejected'
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
