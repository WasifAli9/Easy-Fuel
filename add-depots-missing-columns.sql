-- Add missing columns to depots table
-- This script adds columns that are defined in the schema but missing from the database

-- Add notes column (nullable text)
ALTER TABLE depots 
ADD COLUMN IF NOT EXISTS notes text;

-- Add is_active column (boolean, not null, default true)
ALTER TABLE depots 
ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;

-- Add address columns (all nullable)
ALTER TABLE depots 
ADD COLUMN IF NOT EXISTS address_street text;

ALTER TABLE depots 
ADD COLUMN IF NOT EXISTS address_city text;

ALTER TABLE depots 
ADD COLUMN IF NOT EXISTS address_province text;

ALTER TABLE depots 
ADD COLUMN IF NOT EXISTS address_postal_code text;

-- Verify the columns were added
SELECT 
  column_name, 
  data_type, 
  is_nullable, 
  column_default
FROM information_schema.columns 
WHERE table_name = 'depots' 
  AND column_name IN ('notes', 'is_active', 'address_street', 'address_city', 'address_province', 'address_postal_code')
ORDER BY column_name;

