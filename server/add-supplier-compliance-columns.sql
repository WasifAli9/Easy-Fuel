-- Add missing compliance columns to suppliers table
-- Run this in your Supabase SQL Editor (https://supabase.com/dashboard → SQL Editor)
-- This fixes the "Could not find the 'registered_name' column" error and other missing fields

-- Add company registration columns
ALTER TABLE suppliers 
ADD COLUMN IF NOT EXISTS registered_name TEXT,
ADD COLUMN IF NOT EXISTS registration_number TEXT,
ADD COLUMN IF NOT EXISTS director_names TEXT[],
ADD COLUMN IF NOT EXISTS registered_address TEXT,
ADD COLUMN IF NOT EXISTS trading_as TEXT;

-- Add VAT and tax columns
ALTER TABLE suppliers 
ADD COLUMN IF NOT EXISTS vat_number TEXT,
ADD COLUMN IF NOT EXISTS vat_certificate_expiry TIMESTAMP,
ADD COLUMN IF NOT EXISTS tax_clearance_number TEXT,
ADD COLUMN IF NOT EXISTS tax_clearance_expiry TIMESTAMP,
ADD COLUMN IF NOT EXISTS tax_clearance_pin TEXT,
ADD COLUMN IF NOT EXISTS sars_tax_number TEXT;

-- Add licensing columns
ALTER TABLE suppliers 
ADD COLUMN IF NOT EXISTS dmre_license_number TEXT,
ADD COLUMN IF NOT EXISTS wholesale_license_issue_date TIMESTAMP,
ADD COLUMN IF NOT EXISTS dmre_license_expiry TIMESTAMP,
ADD COLUMN IF NOT EXISTS allowed_fuel_types TEXT[],
ADD COLUMN IF NOT EXISTS site_license_number TEXT,
ADD COLUMN IF NOT EXISTS depot_address TEXT,
ADD COLUMN IF NOT EXISTS permit_number TEXT,
ADD COLUMN IF NOT EXISTS permit_expiry_date TIMESTAMP;

-- Add environmental and safety columns
ALTER TABLE suppliers 
ADD COLUMN IF NOT EXISTS environmental_auth_number TEXT,
ADD COLUMN IF NOT EXISTS approved_storage_capacity_litres INTEGER,
ADD COLUMN IF NOT EXISTS fire_certificate_number TEXT,
ADD COLUMN IF NOT EXISTS fire_certificate_issue_date TIMESTAMP,
ADD COLUMN IF NOT EXISTS fire_certificate_expiry_date TIMESTAMP,
ADD COLUMN IF NOT EXISTS hse_file_verified BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS hse_file_last_updated TIMESTAMP,
ADD COLUMN IF NOT EXISTS spill_compliance_confirmed BOOLEAN DEFAULT false;

-- Add certification columns
ALTER TABLE suppliers 
ADD COLUMN IF NOT EXISTS sabs_certificate_number TEXT,
ADD COLUMN IF NOT EXISTS sabs_certificate_issue_date TIMESTAMP,
ADD COLUMN IF NOT EXISTS sabs_certificate_expiry_date TIMESTAMP,
ADD COLUMN IF NOT EXISTS calibration_certificate_number TEXT,
ADD COLUMN IF NOT EXISTS calibration_certificate_issue_date TIMESTAMP,
ADD COLUMN IF NOT EXISTS calibration_certificate_expiry_date TIMESTAMP;

-- Add insurance columns
ALTER TABLE suppliers 
ADD COLUMN IF NOT EXISTS public_liability_policy_number TEXT,
ADD COLUMN IF NOT EXISTS public_liability_insurance_provider TEXT,
ADD COLUMN IF NOT EXISTS public_liability_coverage_amount_rands INTEGER,
ADD COLUMN IF NOT EXISTS public_liability_policy_expiry_date TIMESTAMP,
ADD COLUMN IF NOT EXISTS env_insurance_number TEXT,
ADD COLUMN IF NOT EXISTS env_insurance_expiry_date TIMESTAMP;

-- Add other business columns
ALTER TABLE suppliers 
ADD COLUMN IF NOT EXISTS bbbee_level TEXT,
ADD COLUMN IF NOT EXISTS coid_number TEXT,
ADD COLUMN IF NOT EXISTS bank_account_name TEXT,
ADD COLUMN IF NOT EXISTS bank_name TEXT,
ADD COLUMN IF NOT EXISTS account_number TEXT,
ADD COLUMN IF NOT EXISTS branch_code TEXT,
ADD COLUMN IF NOT EXISTS account_type TEXT,
ADD COLUMN IF NOT EXISTS primary_contact_name TEXT,
ADD COLUMN IF NOT EXISTS primary_contact_phone TEXT,
ADD COLUMN IF NOT EXISTS primary_contact_email TEXT,
ADD COLUMN IF NOT EXISTS service_regions TEXT[],
ADD COLUMN IF NOT EXISTS depot_addresses JSONB DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS safety_certifications TEXT[],
ADD COLUMN IF NOT EXISTS msds_available BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS compliance_status TEXT DEFAULT 'pending',
ADD COLUMN IF NOT EXISTS compliance_reviewer_id UUID,
ADD COLUMN IF NOT EXISTS compliance_review_date TIMESTAMP,
ADD COLUMN IF NOT EXISTS compliance_rejection_reason TEXT;

-- Add comments for documentation
COMMENT ON COLUMN suppliers.registered_name IS 'Registered company name';
COMMENT ON COLUMN suppliers.registration_number IS 'Company registration number';
COMMENT ON COLUMN suppliers.director_names IS 'Array of director names';
COMMENT ON COLUMN suppliers.registered_address IS 'Registered business address';
COMMENT ON COLUMN suppliers.trading_as IS 'Trading name (if different from registered name)';
COMMENT ON COLUMN suppliers.dmre_license_number IS 'DMRE wholesale fuel license number';
COMMENT ON COLUMN suppliers.dmre_license_expiry IS 'DMRE license expiry date';
COMMENT ON COLUMN suppliers.allowed_fuel_types IS 'Array of allowed fuel types';
COMMENT ON COLUMN suppliers.compliance_status IS 'Overall compliance status (pending, approved, rejected)';

-- Refresh the PostgREST schema cache so the API can see the new columns
NOTIFY pgrst, 'reload schema';

-- Success message
DO $$
BEGIN
  RAISE NOTICE 'Successfully added compliance columns to suppliers table!';
  RAISE NOTICE 'Schema cache refreshed. Compliance updates should now work correctly.';
END $$;

