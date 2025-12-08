-- Comprehensive Compliance System Migration
-- This migration adds all compliance fields to drivers, vehicles, suppliers, and documents tables

-- ============================================
-- 1. EXTEND DOCUMENT_TYPE ENUM
-- ============================================
DO $$ 
BEGIN
  -- Add new document types to the enum
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'dangerous_goods_training' AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'document_type')) THEN
    ALTER TYPE document_type ADD VALUE 'dangerous_goods_training';
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'medical_fitness' AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'document_type')) THEN
    ALTER TYPE document_type ADD VALUE 'medical_fitness';
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'criminal_check' AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'document_type')) THEN
    ALTER TYPE document_type ADD VALUE 'criminal_check';
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'banking_proof' AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'document_type')) THEN
    ALTER TYPE document_type ADD VALUE 'banking_proof';
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'letter_of_authority' AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'document_type')) THEN
    ALTER TYPE document_type ADD VALUE 'letter_of_authority';
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'dg_vehicle_permit' AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'document_type')) THEN
    ALTER TYPE document_type ADD VALUE 'dg_vehicle_permit';
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'environmental_authorisation' AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'document_type')) THEN
    ALTER TYPE document_type ADD VALUE 'environmental_authorisation';
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'fire_certificate' AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'document_type')) THEN
    ALTER TYPE document_type ADD VALUE 'fire_certificate';
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'sabs_certificate' AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'document_type')) THEN
    ALTER TYPE document_type ADD VALUE 'sabs_certificate';
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'calibration_certificate' AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'document_type')) THEN
    ALTER TYPE document_type ADD VALUE 'calibration_certificate';
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'public_liability_insurance' AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'document_type')) THEN
    ALTER TYPE document_type ADD VALUE 'public_liability_insurance';
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'env_liability_insurance' AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'document_type')) THEN
    ALTER TYPE document_type ADD VALUE 'env_liability_insurance';
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'site_license' AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'document_type')) THEN
    ALTER TYPE document_type ADD VALUE 'site_license';
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'fuel_trading_permit' AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'document_type')) THEN
    ALTER TYPE document_type ADD VALUE 'fuel_trading_permit';
  END IF;
END $$;

-- ============================================
-- 2. CREATE NEW ENUMS
-- ============================================
DO $$ BEGIN
  CREATE TYPE driver_type AS ENUM ('individual', 'company_driver');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE driver_status AS ENUM ('pending_compliance', 'active', 'suspended', 'rejected');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE id_type AS ENUM ('SA_ID', 'Passport');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE vehicle_status AS ENUM ('pending_compliance', 'active', 'suspended', 'rejected');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE supplier_status AS ENUM ('pending_compliance', 'active', 'suspended', 'rejected');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- ============================================
-- 3. EXTEND DRIVERS TABLE
-- ============================================
DO $$ 
BEGIN
  -- Driver type and status
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'drivers' AND column_name = 'driver_type') THEN
    ALTER TABLE drivers ADD COLUMN driver_type driver_type;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'drivers' AND column_name = 'status') THEN
    ALTER TABLE drivers ADD COLUMN status driver_status DEFAULT 'pending_compliance';
  END IF;
  
  -- ID type and details
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'drivers' AND column_name = 'id_type') THEN
    ALTER TABLE drivers ADD COLUMN id_type id_type;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'drivers' AND column_name = 'id_issue_country') THEN
    ALTER TABLE drivers ADD COLUMN id_issue_country TEXT;
  END IF;
  
  -- License details
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'drivers' AND column_name = 'license_code') THEN
    ALTER TABLE drivers ADD COLUMN license_code TEXT;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'drivers' AND column_name = 'drivers_license_issue_date') THEN
    ALTER TABLE drivers ADD COLUMN drivers_license_issue_date TIMESTAMP;
  END IF;
  
  -- PrDP details
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'drivers' AND column_name = 'prdp_required') THEN
    ALTER TABLE drivers ADD COLUMN prdp_required BOOLEAN DEFAULT false;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'drivers' AND column_name = 'prdp_category') THEN
    ALTER TABLE drivers ADD COLUMN prdp_category TEXT;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'drivers' AND column_name = 'prdp_issue_date') THEN
    ALTER TABLE drivers ADD COLUMN prdp_issue_date TIMESTAMP;
  END IF;
  
  -- Dangerous Goods Training
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'drivers' AND column_name = 'dg_training_required') THEN
    ALTER TABLE drivers ADD COLUMN dg_training_required BOOLEAN DEFAULT false;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'drivers' AND column_name = 'dg_training_provider') THEN
    ALTER TABLE drivers ADD COLUMN dg_training_provider TEXT;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'drivers' AND column_name = 'dg_training_certificate_number') THEN
    ALTER TABLE drivers ADD COLUMN dg_training_certificate_number TEXT;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'drivers' AND column_name = 'dg_training_issue_date') THEN
    ALTER TABLE drivers ADD COLUMN dg_training_issue_date TIMESTAMP;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'drivers' AND column_name = 'dg_training_expiry_date') THEN
    ALTER TABLE drivers ADD COLUMN dg_training_expiry_date TIMESTAMP;
  END IF;
  
  -- Criminal Check
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'drivers' AND column_name = 'criminal_check_done') THEN
    ALTER TABLE drivers ADD COLUMN criminal_check_done BOOLEAN DEFAULT false;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'drivers' AND column_name = 'criminal_check_reference') THEN
    ALTER TABLE drivers ADD COLUMN criminal_check_reference TEXT;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'drivers' AND column_name = 'criminal_check_date') THEN
    ALTER TABLE drivers ADD COLUMN criminal_check_date TIMESTAMP;
  END IF;
  
  -- Company Link
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'drivers' AND column_name = 'is_company_driver') THEN
    ALTER TABLE drivers ADD COLUMN is_company_driver BOOLEAN DEFAULT false;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'drivers' AND column_name = 'company_id') THEN
    ALTER TABLE drivers ADD COLUMN company_id UUID REFERENCES customers(id);
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'drivers' AND column_name = 'role_in_company') THEN
    ALTER TABLE drivers ADD COLUMN role_in_company TEXT;
  END IF;
  
  -- Address fields
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'drivers' AND column_name = 'address_line_1') THEN
    ALTER TABLE drivers ADD COLUMN address_line_1 TEXT;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'drivers' AND column_name = 'address_line_2') THEN
    ALTER TABLE drivers ADD COLUMN address_line_2 TEXT;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'drivers' AND column_name = 'city') THEN
    ALTER TABLE drivers ADD COLUMN city TEXT;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'drivers' AND column_name = 'province') THEN
    ALTER TABLE drivers ADD COLUMN province TEXT;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'drivers' AND column_name = 'postal_code') THEN
    ALTER TABLE drivers ADD COLUMN postal_code TEXT;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'drivers' AND column_name = 'country') THEN
    ALTER TABLE drivers ADD COLUMN country TEXT DEFAULT 'South Africa';
  END IF;
  
  -- Compliance tracking
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'drivers' AND column_name = 'compliance_status') THEN
    ALTER TABLE drivers ADD COLUMN compliance_status TEXT DEFAULT 'pending';
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'drivers' AND column_name = 'compliance_reviewer_id') THEN
    ALTER TABLE drivers ADD COLUMN compliance_reviewer_id UUID;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'drivers' AND column_name = 'compliance_review_date') THEN
    ALTER TABLE drivers ADD COLUMN compliance_review_date TIMESTAMP;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'drivers' AND column_name = 'compliance_rejection_reason') THEN
    ALTER TABLE drivers ADD COLUMN compliance_rejection_reason TEXT;
  END IF;
END $$;

-- ============================================
-- 4. EXTEND VEHICLES TABLE
-- ============================================
DO $$ 
BEGIN
  -- Vehicle status
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'vehicles' AND column_name = 'vehicle_status') THEN
    ALTER TABLE vehicles ADD COLUMN vehicle_status vehicle_status DEFAULT 'pending_compliance';
  END IF;
  
  -- Vehicle registration certificate
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'vehicles' AND column_name = 'vehicle_reg_certificate_number') THEN
    ALTER TABLE vehicles ADD COLUMN vehicle_reg_certificate_number TEXT;
  END IF;
  
  -- Dangerous Goods Vehicle Permit
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'vehicles' AND column_name = 'dg_vehicle_permit_required') THEN
    ALTER TABLE vehicles ADD COLUMN dg_vehicle_permit_required BOOLEAN DEFAULT false;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'vehicles' AND column_name = 'dg_vehicle_permit_number') THEN
    ALTER TABLE vehicles ADD COLUMN dg_vehicle_permit_number TEXT;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'vehicles' AND column_name = 'dg_vehicle_permit_issue_date') THEN
    ALTER TABLE vehicles ADD COLUMN dg_vehicle_permit_issue_date TIMESTAMP;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'vehicles' AND column_name = 'dg_vehicle_permit_expiry_date') THEN
    ALTER TABLE vehicles ADD COLUMN dg_vehicle_permit_expiry_date TIMESTAMP;
  END IF;
  
  -- Insurance details
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'vehicles' AND column_name = 'vehicle_insured') THEN
    ALTER TABLE vehicles ADD COLUMN vehicle_insured BOOLEAN DEFAULT false;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'vehicles' AND column_name = 'insurance_provider') THEN
    ALTER TABLE vehicles ADD COLUMN insurance_provider TEXT;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'vehicles' AND column_name = 'policy_number') THEN
    ALTER TABLE vehicles ADD COLUMN policy_number TEXT;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'vehicles' AND column_name = 'policy_expiry_date') THEN
    ALTER TABLE vehicles ADD COLUMN policy_expiry_date TIMESTAMP;
  END IF;
  
  -- Letter of Authority
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'vehicles' AND column_name = 'loa_required') THEN
    ALTER TABLE vehicles ADD COLUMN loa_required BOOLEAN DEFAULT false;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'vehicles' AND column_name = 'loa_issue_date') THEN
    ALTER TABLE vehicles ADD COLUMN loa_issue_date TIMESTAMP;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'vehicles' AND column_name = 'loa_expiry_date') THEN
    ALTER TABLE vehicles ADD COLUMN loa_expiry_date TIMESTAMP;
  END IF;
  
  -- Roadworthy certificate
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'vehicles' AND column_name = 'roadworthy_certificate_number') THEN
    ALTER TABLE vehicles ADD COLUMN roadworthy_certificate_number TEXT;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'vehicles' AND column_name = 'roadworthy_issue_date') THEN
    ALTER TABLE vehicles ADD COLUMN roadworthy_issue_date TIMESTAMP;
  END IF;
END $$;

-- ============================================
-- 5. EXTEND SUPPLIERS TABLE
-- ============================================
DO $$ 
BEGIN
  -- Supplier status
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'suppliers' AND column_name = 'status') THEN
    ALTER TABLE suppliers ADD COLUMN status supplier_status DEFAULT 'pending_compliance';
  END IF;
  
  -- Company Registration
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'suppliers' AND column_name = 'director_names') THEN
    ALTER TABLE suppliers ADD COLUMN director_names TEXT[];
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'suppliers' AND column_name = 'registered_address') THEN
    ALTER TABLE suppliers ADD COLUMN registered_address TEXT;
  END IF;
  
  -- VAT Certificate
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'suppliers' AND column_name = 'vat_certificate_expiry') THEN
    ALTER TABLE suppliers ADD COLUMN vat_certificate_expiry TIMESTAMP;
  END IF;
  
  -- Tax Clearance
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'suppliers' AND column_name = 'tax_clearance_number') THEN
    ALTER TABLE suppliers ADD COLUMN tax_clearance_number TEXT;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'suppliers' AND column_name = 'tax_clearance_expiry') THEN
    ALTER TABLE suppliers ADD COLUMN tax_clearance_expiry TIMESTAMP;
  END IF;
  
  -- Petroleum Licensing
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'suppliers' AND column_name = 'wholesale_license_issue_date') THEN
    ALTER TABLE suppliers ADD COLUMN wholesale_license_issue_date TIMESTAMP;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'suppliers' AND column_name = 'allowed_fuel_types') THEN
    ALTER TABLE suppliers ADD COLUMN allowed_fuel_types TEXT[];
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'suppliers' AND column_name = 'site_license_number') THEN
    ALTER TABLE suppliers ADD COLUMN site_license_number TEXT;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'suppliers' AND column_name = 'depot_address') THEN
    ALTER TABLE suppliers ADD COLUMN depot_address TEXT;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'suppliers' AND column_name = 'permit_number') THEN
    ALTER TABLE suppliers ADD COLUMN permit_number TEXT;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'suppliers' AND column_name = 'permit_expiry_date') THEN
    ALTER TABLE suppliers ADD COLUMN permit_expiry_date TIMESTAMP;
  END IF;
  
  -- Environmental & Safety
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'suppliers' AND column_name = 'environmental_auth_number') THEN
    ALTER TABLE suppliers ADD COLUMN environmental_auth_number TEXT;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'suppliers' AND column_name = 'approved_storage_capacity_litres') THEN
    ALTER TABLE suppliers ADD COLUMN approved_storage_capacity_litres INTEGER;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'suppliers' AND column_name = 'fire_certificate_number') THEN
    ALTER TABLE suppliers ADD COLUMN fire_certificate_number TEXT;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'suppliers' AND column_name = 'fire_certificate_issue_date') THEN
    ALTER TABLE suppliers ADD COLUMN fire_certificate_issue_date TIMESTAMP;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'suppliers' AND column_name = 'fire_certificate_expiry_date') THEN
    ALTER TABLE suppliers ADD COLUMN fire_certificate_expiry_date TIMESTAMP;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'suppliers' AND column_name = 'hse_file_verified') THEN
    ALTER TABLE suppliers ADD COLUMN hse_file_verified BOOLEAN DEFAULT false;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'suppliers' AND column_name = 'hse_file_last_updated') THEN
    ALTER TABLE suppliers ADD COLUMN hse_file_last_updated TIMESTAMP;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'suppliers' AND column_name = 'spill_compliance_confirmed') THEN
    ALTER TABLE suppliers ADD COLUMN spill_compliance_confirmed BOOLEAN DEFAULT false;
  END IF;
  
  -- Fuel Quality
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'suppliers' AND column_name = 'sabs_certificate_number') THEN
    ALTER TABLE suppliers ADD COLUMN sabs_certificate_number TEXT;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'suppliers' AND column_name = 'sabs_certificate_issue_date') THEN
    ALTER TABLE suppliers ADD COLUMN sabs_certificate_issue_date TIMESTAMP;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'suppliers' AND column_name = 'sabs_certificate_expiry_date') THEN
    ALTER TABLE suppliers ADD COLUMN sabs_certificate_expiry_date TIMESTAMP;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'suppliers' AND column_name = 'calibration_certificate_number') THEN
    ALTER TABLE suppliers ADD COLUMN calibration_certificate_number TEXT;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'suppliers' AND column_name = 'calibration_certificate_issue_date') THEN
    ALTER TABLE suppliers ADD COLUMN calibration_certificate_issue_date TIMESTAMP;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'suppliers' AND column_name = 'calibration_certificate_expiry_date') THEN
    ALTER TABLE suppliers ADD COLUMN calibration_certificate_expiry_date TIMESTAMP;
  END IF;
  
  -- Insurance
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'suppliers' AND column_name = 'public_liability_policy_number') THEN
    ALTER TABLE suppliers ADD COLUMN public_liability_policy_number TEXT;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'suppliers' AND column_name = 'public_liability_insurance_provider') THEN
    ALTER TABLE suppliers ADD COLUMN public_liability_insurance_provider TEXT;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'suppliers' AND column_name = 'public_liability_coverage_amount_rands') THEN
    ALTER TABLE suppliers ADD COLUMN public_liability_coverage_amount_rands INTEGER;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'suppliers' AND column_name = 'public_liability_policy_expiry_date') THEN
    ALTER TABLE suppliers ADD COLUMN public_liability_policy_expiry_date TIMESTAMP;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'suppliers' AND column_name = 'env_insurance_number') THEN
    ALTER TABLE suppliers ADD COLUMN env_insurance_number TEXT;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'suppliers' AND column_name = 'env_insurance_expiry_date') THEN
    ALTER TABLE suppliers ADD COLUMN env_insurance_expiry_date TIMESTAMP;
  END IF;
  
  -- Compliance tracking
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'suppliers' AND column_name = 'compliance_status') THEN
    ALTER TABLE suppliers ADD COLUMN compliance_status TEXT DEFAULT 'pending';
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'suppliers' AND column_name = 'compliance_reviewer_id') THEN
    ALTER TABLE suppliers ADD COLUMN compliance_reviewer_id UUID;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'suppliers' AND column_name = 'compliance_review_date') THEN
    ALTER TABLE suppliers ADD COLUMN compliance_review_date TIMESTAMP;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'suppliers' AND column_name = 'compliance_rejection_reason') THEN
    ALTER TABLE suppliers ADD COLUMN compliance_rejection_reason TEXT;
  END IF;
END $$;

-- ============================================
-- 6. EXTEND DOCUMENTS TABLE
-- ============================================
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'documents' AND column_name = 'document_issue_date') THEN
    ALTER TABLE documents ADD COLUMN document_issue_date TIMESTAMP;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'documents' AND column_name = 'document_rejection_reason') THEN
    ALTER TABLE documents ADD COLUMN document_rejection_reason TEXT;
  END IF;
END $$;

-- ============================================
-- 7. CREATE INDEXES FOR PERFORMANCE
-- ============================================
CREATE INDEX IF NOT EXISTS idx_drivers_status ON drivers(status);
CREATE INDEX IF NOT EXISTS idx_drivers_compliance_status ON drivers(compliance_status);
CREATE INDEX IF NOT EXISTS idx_vehicles_status ON vehicles(vehicle_status);
CREATE INDEX IF NOT EXISTS idx_suppliers_status ON suppliers(status);
CREATE INDEX IF NOT EXISTS idx_suppliers_compliance_status ON suppliers(compliance_status);
CREATE INDEX IF NOT EXISTS idx_documents_issue_date ON documents(document_issue_date);

-- ============================================
-- 8. SET DEFAULT STATUS FOR EXISTING RECORDS
-- ============================================
UPDATE drivers SET status = 'pending_compliance' WHERE status IS NULL;
UPDATE vehicles SET vehicle_status = 'pending_compliance' WHERE vehicle_status IS NULL;
UPDATE suppliers SET status = 'pending_compliance' WHERE status IS NULL;

