-- Create documents table for storing uploaded files
-- Run this in your Supabase SQL Editor (https://supabase.com/dashboard → SQL Editor)

-- First ensure enum types exist (safe if already exists)
DO $$ BEGIN
  CREATE TYPE document_type AS ENUM (
    'za_id',
    'passport',
    'drivers_license',
    'prdp',
    'vehicle_registration',
    'roadworthy_certificate',
    'insurance_certificate',
    'cipc_certificate',
    'vat_certificate',
    'tax_clearance',
    'bbbee_certificate',
    'dmre_license',
    'coid_certificate',
    'bank_statement',
    'proof_of_address',
    'msds',
    'safety_certificate',
    'other'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE owner_type AS ENUM ('customer', 'driver', 'supplier', 'vehicle');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Create documents table
CREATE TABLE IF NOT EXISTS documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_type owner_type NOT NULL,
  owner_id UUID NOT NULL,
  doc_type document_type NOT NULL,
  title TEXT NOT NULL,
  file_path TEXT NOT NULL,
  file_size INTEGER,
  mime_type TEXT,
  uploaded_by UUID,
  verification_status TEXT DEFAULT 'pending',
  verified_by UUID,
  verified_at TIMESTAMP,
  expiry_date TIMESTAMP,
  notes TEXT,
  created_at TIMESTAMP DEFAULT now() NOT NULL,
  updated_at TIMESTAMP DEFAULT now() NOT NULL
);

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_documents_owner ON documents(owner_type, owner_id);
CREATE INDEX IF NOT EXISTS idx_documents_uploaded_by ON documents(uploaded_by);
CREATE INDEX IF NOT EXISTS idx_documents_verification_status ON documents(verification_status);

-- Add comments for documentation
COMMENT ON TABLE documents IS 'Stores all uploaded files such as IDs, licenses, certificates, and compliance proofs';
COMMENT ON COLUMN documents.owner_type IS 'Whether the document belongs to a Customer, Driver, Supplier, or Vehicle';
COMMENT ON COLUMN documents.owner_id IS 'The specific ID of that person or vehicle';
COMMENT ON COLUMN documents.doc_type IS 'Type of document (e.g., CIPC Cert, SARS Pin, PRDP Card, etc.)';
COMMENT ON COLUMN documents.verification_status IS 'Whether the document is pending, verified, or rejected';

