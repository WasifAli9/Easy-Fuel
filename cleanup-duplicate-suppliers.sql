-- Cleanup Duplicate Supplier Records
-- This script removes duplicate supplier records, keeping only the most recent one per owner_id
-- Run this in Supabase Dashboard → SQL Editor

-- Step 1: View duplicates (for verification)
SELECT 
  owner_id, 
  COUNT(*) as count,
  array_agg(id ORDER BY created_at DESC) as supplier_ids,
  array_agg(created_at ORDER BY created_at DESC) as created_dates
FROM suppliers 
GROUP BY owner_id 
HAVING COUNT(*) > 1;

-- Step 2: Create a temporary table to identify which supplier to keep
-- Priority: Keep the one with depots, or the most recent one if none have depots
CREATE TEMP TABLE IF NOT EXISTS supplier_keepers AS
SELECT 
  s.id,
  s.owner_id,
  ROW_NUMBER() OVER (
    PARTITION BY s.owner_id 
    ORDER BY 
      COUNT(DISTINCT d.id) DESC,  -- Prefer supplier with most depots
      COUNT(DISTINCT ds.driver_id) DESC,  -- Then most driver relationships
      s.created_at DESC,  -- Then most recent
      s.updated_at DESC
  ) as row_num
FROM suppliers s
LEFT JOIN depots d ON d.supplier_id = s.id
LEFT JOIN driver_suppliers ds ON ds.supplier_id = s.id
GROUP BY s.id, s.owner_id, s.created_at, s.updated_at;

-- Step 2a: Update depots to point to the supplier we're keeping
UPDATE depots
SET supplier_id = (
  SELECT k.id 
  FROM supplier_keepers k 
  WHERE k.owner_id = (
    SELECT owner_id FROM suppliers WHERE id = depots.supplier_id
  ) AND k.row_num = 1
)
WHERE supplier_id IN (
  SELECT id FROM supplier_keepers WHERE row_num > 1
);

-- Step 2b: Update driver_suppliers to point to the supplier we're keeping
UPDATE driver_suppliers
SET supplier_id = (
  SELECT k.id 
  FROM supplier_keepers k 
  WHERE k.owner_id = (
    SELECT owner_id FROM suppliers WHERE id = driver_suppliers.supplier_id
  ) AND k.row_num = 1
)
WHERE supplier_id IN (
  SELECT id FROM supplier_keepers WHERE row_num > 1
);

-- Step 2c: Now delete the duplicate suppliers (after references have been reassigned)
DELETE FROM suppliers
WHERE id IN (
  SELECT id FROM supplier_keepers WHERE row_num > 1
);

-- Clean up temporary table
DROP TABLE IF EXISTS supplier_keepers;

-- Step 3: Verify cleanup (should return 0 rows)
SELECT 
  owner_id, 
  COUNT(*) as count 
FROM suppliers 
GROUP BY owner_id 
HAVING COUNT(*) > 1;

-- Step 4: Add a unique constraint to prevent future duplicates (optional but recommended)
-- This will prevent duplicate supplier records from being created in the future
-- Note: This will fail if duplicates still exist, so run Step 2 first

-- First, check if constraint already exists
SELECT 
  conname as constraint_name
FROM pg_constraint
WHERE conrelid = 'suppliers'::regclass
  AND conname = 'suppliers_owner_id_unique';

-- If the above returns no rows, create the unique constraint:
-- ALTER TABLE suppliers 
-- ADD CONSTRAINT suppliers_owner_id_unique UNIQUE (owner_id);

-- Note: If you want to allow multiple suppliers per owner in the future,
-- you can skip Step 4, but you'll need to ensure all code uses .limit(1) 
-- when querying suppliers by owner_id (which we've already done).

