-- Company accounts + driver–company memberships (run on Supabase SQL editor or psql)
-- 1) Extend app role enum
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum e
    JOIN pg_type t ON e.enumtypid = t.oid
    WHERE t.typname = 'role' AND e.enumlabel = 'company'
  ) THEN
    ALTER TYPE public.role ADD VALUE 'company';
  END IF;
END$$;

-- 2) Transport / fleet companies (one row per company account owner)
CREATE TABLE IF NOT EXISTS public.companies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  name text NOT NULL,
  status text NOT NULL DEFAULT 'active',
  contact_email text,
  contact_phone text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT companies_owner_user_id_key UNIQUE (owner_user_id)
);

CREATE INDEX IF NOT EXISTS companies_status_idx ON public.companies (status);

-- 3) At most one membership row per driver; optional company link
CREATE TABLE IF NOT EXISTS public.driver_company_memberships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id uuid NOT NULL UNIQUE REFERENCES public.drivers(id) ON DELETE CASCADE,
  company_id uuid REFERENCES public.companies(id) ON DELETE SET NULL,
  is_disabled_by_company boolean NOT NULL DEFAULT false,
  disabled_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS driver_company_memberships_company_id_idx
  ON public.driver_company_memberships (company_id);
