-- Cleanup Duplicate Supplier Records - Step by Step
-- Run each step separately in Supabase Dashboard → SQL Editor
-- Check results after each step before proceeding

-- ============================================
-- STEP 1: View duplicates (for verification)
-- ============================================
SELECT 
  owner_id, 
  COUNT(*) as count,
  array_agg(id ORDER BY created_at DESC) as supplier_ids,
  array_agg(created_at ORDER BY created_at DESC) as created_dates
FROM suppliers 
GROUP BY owner_id 
HAVING COUNT(*) > 1;

-- ============================================
-- STEP 2: Identify which supplier to keep for each owner_id
-- Priority: Keep the one with depots, or the most recent one if none have depots
-- ============================================
-- This query shows which supplier will be kept (row_num = 1) and which will be deleted (row_num > 1)
SELECT 
  s.id,
  s.owner_id,
  s.created_at,
  COUNT(DISTINCT d.id) as depot_count,
  COUNT(DISTINCT ds.driver_id) as driver_count,
  ROW_NUMBER() OVER (
    PARTITION BY s.owner_id 
    ORDER BY 
      COUNT(DISTINCT d.id) DESC,  -- Prefer supplier with most depots
      COUNT(DISTINCT ds.driver_id) DESC,  -- Then most driver relationships
      s.created_at DESC,  -- Then most recent
      s.updated_at DESC
  ) as row_num,
  CASE 
    WHEN ROW_NUMBER() OVER (
      PARTITION BY s.owner_id 
      ORDER BY 
        COUNT(DISTINCT d.id) DESC,
        COUNT(DISTINCT ds.driver_id) DESC,
        s.created_at DESC,
        s.updated_at DESC
    ) = 1 THEN 'KEEP'
    ELSE 'DELETE'
  END as action
FROM suppliers s
LEFT JOIN depots d ON d.supplier_id = s.id
LEFT JOIN driver_suppliers ds ON ds.supplier_id = s.id
WHERE s.owner_id IN (
  SELECT owner_id 
  FROM suppliers 
  GROUP BY owner_id 
  HAVING COUNT(*) > 1
)
GROUP BY s.id, s.owner_id, s.created_at, s.updated_at
ORDER BY s.owner_id, row_num;

-- ============================================
-- STEP 3: Update depots to point to the supplier we're keeping
-- ============================================
-- This updates all depots that reference duplicate suppliers to point to the one we're keeping
WITH supplier_rankings AS (
  SELECT 
    s.id,
    s.owner_id,
    ROW_NUMBER() OVER (
      PARTITION BY s.owner_id 
      ORDER BY 
        COUNT(DISTINCT d.id) DESC,
        COUNT(DISTINCT ds.driver_id) DESC,
        s.created_at DESC,
        s.updated_at DESC
    ) as row_num
  FROM suppliers s
  LEFT JOIN depots d ON d.supplier_id = s.id
  LEFT JOIN driver_suppliers ds ON ds.supplier_id = s.id
  GROUP BY s.id, s.owner_id, s.created_at, s.updated_at
),
keepers AS (
  SELECT id, owner_id
  FROM supplier_rankings
  WHERE row_num = 1
),
duplicates AS (
  SELECT id, owner_id
  FROM supplier_rankings
  WHERE row_num > 1
)
UPDATE depots
SET supplier_id = keepers.id
FROM duplicates
JOIN keepers ON keepers.owner_id = duplicates.owner_id
WHERE depots.supplier_id = duplicates.id
  AND depots.supplier_id != keepers.id;

-- ============================================
-- STEP 4: Update driver_suppliers to point to the supplier we're keeping
-- ============================================
WITH supplier_rankings AS (
  SELECT 
    s.id,
    s.owner_id,
    ROW_NUMBER() OVER (
      PARTITION BY s.owner_id 
      ORDER BY 
        COUNT(DISTINCT d.id) DESC,
        COUNT(DISTINCT ds.driver_id) DESC,
        s.created_at DESC,
        s.updated_at DESC
    ) as row_num
  FROM suppliers s
  LEFT JOIN depots d ON d.supplier_id = s.id
  LEFT JOIN driver_suppliers ds ON ds.supplier_id = s.id
  GROUP BY s.id, s.owner_id, s.created_at, s.updated_at
),
keepers AS (
  SELECT id, owner_id
  FROM supplier_rankings
  WHERE row_num = 1
),
duplicates AS (
  SELECT id, owner_id
  FROM supplier_rankings
  WHERE row_num > 1
)
UPDATE driver_suppliers
SET supplier_id = keepers.id
FROM duplicates
JOIN keepers ON keepers.owner_id = duplicates.owner_id
WHERE driver_suppliers.supplier_id = duplicates.id
  AND driver_suppliers.supplier_id != keepers.id;

-- ============================================
-- STEP 5: Delete duplicate suppliers (after references have been reassigned)
-- ============================================
WITH supplier_rankings AS (
  SELECT 
    s.id,
    s.owner_id,
    ROW_NUMBER() OVER (
      PARTITION BY s.owner_id 
      ORDER BY 
        COUNT(DISTINCT d.id) DESC,
        COUNT(DISTINCT ds.driver_id) DESC,
        s.created_at DESC,
        s.updated_at DESC
    ) as row_num
  FROM suppliers s
  LEFT JOIN depots d ON d.supplier_id = s.id
  LEFT JOIN driver_suppliers ds ON ds.supplier_id = s.id
  GROUP BY s.id, s.owner_id, s.created_at, s.updated_at
)
DELETE FROM suppliers
WHERE id IN (
  SELECT id 
  FROM supplier_rankings 
  WHERE row_num > 1
);

-- ============================================
-- STEP 6: Verify cleanup (should return 0 rows)
-- ============================================
SELECT 
  owner_id, 
  COUNT(*) as count 
FROM suppliers 
GROUP BY owner_id 
HAVING COUNT(*) > 1;

-- ============================================
-- STEP 7: Add unique constraint to prevent future duplicates (OPTIONAL)
-- Only run this if Step 6 returns 0 rows
-- ============================================
-- First check if constraint already exists
SELECT 
  conname as constraint_name
FROM pg_constraint
WHERE conrelid = 'suppliers'::regclass
  AND conname = 'suppliers_owner_id_unique';

-- If the above returns no rows, uncomment and run this:
-- ALTER TABLE suppliers 
-- ADD CONSTRAINT suppliers_owner_id_unique UNIQUE (owner_id);

