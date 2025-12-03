-- Delete All Users from Supabase Auth
-- WARNING: This will permanently delete all user accounts from Supabase Auth
-- This includes customers, suppliers, drivers, and admins
-- Run this in Supabase Dashboard → SQL Editor
-- 
-- IMPORTANT: This is a destructive operation. Make sure you have a backup if needed.
-- 
-- NOTE: You must be logged in as a service_role or have admin privileges to delete from auth.users

-- ============================================
-- STEP 1: View all users (for verification)
-- ============================================
SELECT 
  id,
  email,
  created_at,
  email_confirmed_at,
  last_sign_in_at
FROM auth.users
ORDER BY created_at DESC;

-- ============================================
-- STEP 2: Delete all users from Supabase Auth
-- ============================================
-- This will delete all user accounts from auth.users
-- This will also cascade delete related records if CASCADE is set up
DELETE FROM auth.users;

-- ============================================
-- STEP 3: Optional - Delete all profiles
-- ============================================
-- Uncomment to also delete all profile records:
-- DELETE FROM profiles;

-- ============================================
-- STEP 4: Verify deletion
-- ============================================
-- Check remaining counts
SELECT 
  'auth.users' as table_name, COUNT(*) as count FROM auth.users
UNION ALL
SELECT 
  'profiles' as table_name, COUNT(*) as count FROM profiles;

-- All counts should be 0

-- ============================================
-- ALTERNATIVE: Delete specific user by email
-- ============================================
-- If you only want to delete a specific user, use this instead:
-- DELETE FROM auth.users WHERE email = 'Customer@deffinity.com';

