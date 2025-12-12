-- ============================================================================
-- DELETE ALL USERS AND ALL THEIR DATA
-- ============================================================================
-- WARNING: This script will DELETE ALL users (admin, supplier, driver, customer)
-- and ALL their related data including:
-- - Orders, payments, documents, vehicles, addresses, notifications, etc.
-- - This is IRREVERSIBLE. Use only for testing/development!
-- ============================================================================
-- Run this in your Supabase SQL Editor (https://supabase.com/dashboard → SQL Editor)
-- ============================================================================

BEGIN;

-- ============================================================================
-- STEP 1: Delete all child/related tables (those with foreign keys)
-- ============================================================================

-- Delete chat messages (references chat_threads)
DELETE FROM public.chat_messages;

-- Delete chat threads (references orders, customers, drivers)
DELETE FROM public.chat_threads;

-- Delete notifications (references auth.users via user_id)
DELETE FROM public.notifications;

-- Delete push subscriptions (references auth.users via user_id)
DELETE FROM public.push_subscriptions;

-- Delete driver locations (references drivers, orders)


-- Delete pricing history (references drivers/depots, fuel_types)
DELETE FROM public.pricing_history;

-- Delete driver pricing (references drivers, fuel_types)
DELETE FROM public.driver_pricing;

-- Delete driver subscriptions (references drivers)
DELETE FROM public.driver_subscriptions;



-- Delete payments (references orders)
DELETE FROM public.payments;

-- Delete proof of delivery (references orders)
DELETE FROM public.proof_of_delivery;

-- Delete dispatch offers (references orders, drivers)
DELETE FROM public.dispatch_offers;

-- Delete orders (references customers, fuel_types, delivery_addresses, payment_methods, depots, drivers)
DELETE FROM public.orders;

-- Delete driver depot orders (if table exists - references drivers, depots, fuel_types)
DO $$ 
BEGIN
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'driver_depot_orders') THEN
    DELETE FROM public.driver_depot_orders;
  END IF;
END $$;

-- Delete documents (references various owners via owner_id)
DELETE FROM public.documents;

-- Delete vehicles (references drivers)
DELETE FROM public.vehicles;

-- Delete driver suppliers junction table (references drivers, suppliers)
DELETE FROM public.driver_suppliers;

-- Delete delivery addresses (references customers)
DELETE FROM public.delivery_addresses;

-- Delete payment methods (references customers)
DELETE FROM public.payment_methods;

-- Delete depot prices (references depots, fuel_types)
DELETE FROM public.depot_prices;

-- Delete depots (references suppliers)
DELETE FROM public.depots;

-- ============================================================================
-- STEP 2: Delete main user role tables
-- ============================================================================

-- Delete drivers (references auth.users via user_id, customers via company_id)
DELETE FROM public.drivers;

-- Delete suppliers (references auth.users via owner_id)
DELETE FROM public.suppliers;

-- Delete customers (references auth.users via user_id)
DELETE FROM public.customers;



-- ============================================================================
-- STEP 3: Delete profiles (references auth.users via id)
-- ============================================================================

DELETE FROM public.profiles;

-- ============================================================================
-- STEP 4: Delete all auth users from Supabase Auth
-- ============================================================================
-- Note: This requires admin privileges and uses Supabase's auth schema

DO $$
DECLARE
  user_record RECORD;
BEGIN
  -- Loop through all users in auth.users and delete them
  FOR user_record IN 
    SELECT id FROM auth.users
  LOOP
    -- Delete user from auth.users (this will cascade to auth.identities, auth.sessions, etc.)
    DELETE FROM auth.users WHERE id = user_record.id;
  END LOOP;
  
  RAISE NOTICE 'All auth users deleted';
END $$;

-- ============================================================================
-- STEP 5: Reset sequences (optional but recommended for clean state)
-- ============================================================================

-- Reset any sequences if they exist
DO $$
DECLARE
  seq_record RECORD;
BEGIN
  FOR seq_record IN 
    SELECT sequence_name 
    FROM information_schema.sequences 
    WHERE sequence_schema = 'public'
  LOOP
    EXECUTE 'ALTER SEQUENCE ' || quote_ident(seq_record.sequence_name) || ' RESTART WITH 1';
  END LOOP;
END $$;

COMMIT;

-- ============================================================================
-- SUCCESS MESSAGE
-- ============================================================================

DO $$
BEGIN
  RAISE NOTICE '============================================================================';
  RAISE NOTICE 'SUCCESS: All users and data have been deleted!';
  RAISE NOTICE '============================================================================';
  RAISE NOTICE 'Deleted:';
  RAISE NOTICE '  - All orders, payments, documents, vehicles';
  RAISE NOTICE '  - All drivers, suppliers, customers, admins';
  RAISE NOTICE '  - All profiles';
  RAISE NOTICE '  - All auth users';
  RAISE NOTICE '============================================================================';
  RAISE NOTICE 'You can now start fresh with new test data.';
  RAISE NOTICE '============================================================================';
END $$;

