-- Company-owned fleet vehicles: optional company_id, nullable driver_id (pool vs assigned)
-- Run in Supabase SQL editor after companies + driver_company_memberships exist.

ALTER TABLE public.vehicles
  ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE;

ALTER TABLE public.vehicles DROP CONSTRAINT IF EXISTS vehicles_driver_id_fkey;

ALTER TABLE public.vehicles
  ALTER COLUMN driver_id DROP NOT NULL;

ALTER TABLE public.vehicles
  ADD CONSTRAINT vehicles_driver_id_fkey
  FOREIGN KEY (driver_id) REFERENCES public.drivers(id) ON DELETE SET NULL;

ALTER TABLE public.vehicles DROP CONSTRAINT IF EXISTS vehicles_company_or_driver_chk;

ALTER TABLE public.vehicles
  ADD CONSTRAINT vehicles_company_or_driver_chk
  CHECK (company_id IS NOT NULL OR driver_id IS NOT NULL);

CREATE INDEX IF NOT EXISTS idx_vehicles_company_id ON public.vehicles (company_id);

CREATE UNIQUE INDEX IF NOT EXISTS vehicles_company_reg_unique
  ON public.vehicles (company_id, lower(registration_number))
  WHERE company_id IS NOT NULL;
