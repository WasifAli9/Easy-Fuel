-- Delete All Customers, Suppliers, and Drivers
-- WARNING: This will permanently delete all data related to customers, suppliers, and drivers
-- This includes orders, payments, depots, and all related records
-- Run this in Supabase Dashboard → SQL Editor
-- 
-- IMPORTANT: This is a destructive operation. Make sure you have a backup if needed.

-- ============================================
-- STEP 1: Delete order-related records first
-- ============================================

-- Delete proof of delivery records (references orders)
DELETE FROM proof_of_delivery;

-- Delete payments (references orders)
DELETE FROM payments;

-- Delete dispatch offers (references orders and drivers)
DELETE FROM dispatch_offers;

-- Delete driver depot orders (references drivers and depots)
DELETE FROM driver_depot_orders;

-- Delete orders FIRST (references customers, drivers, depots, and delivery_addresses)
DELETE FROM orders;

-- Delete delivery addresses (references customers, but orders reference delivery_addresses)
-- Must delete after orders since orders.delivery_address_id references this table
DELETE FROM delivery_addresses;

-- ============================================
-- STEP 2: Delete supplier-related records
-- ============================================

-- Delete pricing history for depots (references depots via entity_id)
DELETE FROM pricing_history WHERE entity_type = 'depot';

-- Delete depot prices (references depots)
DELETE FROM depot_prices;

-- Delete depots (references suppliers)
DELETE FROM depots;

-- Delete driver-supplier relationships (references drivers and suppliers)
DELETE FROM driver_suppliers;

-- ============================================
-- STEP 3: Delete driver-related records
-- ============================================

-- Delete pricing history for drivers (references drivers via entity_id)
DELETE FROM pricing_history WHERE entity_type = 'driver';

-- Delete driver pricing (references drivers)
DELETE FROM driver_pricing;

-- Delete driver subscriptions (references drivers)
DELETE FROM driver_subscriptions;

-- Delete vehicles (if table exists, references drivers)
-- Uncomment if you have this table:
-- DELETE FROM vehicles;

-- ============================================
-- STEP 4: Delete the main entities
-- ============================================

-- Delete all customers
DELETE FROM customers;

-- Delete all suppliers
DELETE FROM suppliers;

-- Delete all drivers
DELETE FROM drivers;

-- ============================================
-- STEP 5: Optional - Delete profiles for these users
-- WARNING: This will delete profiles for customers, suppliers, and drivers
-- Only run this if you want to remove the profile records too
-- ============================================

-- Uncomment to delete profiles for customers, suppliers, and drivers:
-- DELETE FROM profiles 
-- WHERE role IN ('customer', 'supplier', 'driver');

-- ============================================
-- IMPORTANT: Delete Auth Users Separately
-- ============================================
-- This script only deletes data from application tables.
-- To delete user accounts from Supabase Auth (so they can sign up again),
-- you need to run the separate script: delete-all-auth-users.sql
-- 
-- The auth.users table is separate and requires special permissions to delete.
-- Without deleting from auth.users, users will get "User already registered" 
-- when trying to sign up with the same email again.

-- ============================================
-- STEP 6: Verify deletion
-- ============================================

-- Check remaining counts
SELECT 
  'customers' as table_name, COUNT(*) as count FROM customers
UNION ALL
SELECT 
  'suppliers' as table_name, COUNT(*) as count FROM suppliers
UNION ALL
SELECT 
  'drivers' as table_name, COUNT(*) as count FROM drivers
UNION ALL
SELECT 
  'orders' as table_name, COUNT(*) as count FROM orders
UNION ALL
SELECT 
  'depots' as table_name, COUNT(*) as count FROM depots
UNION ALL
SELECT 
  'driver_suppliers' as table_name, COUNT(*) as count FROM driver_suppliers
UNION ALL
SELECT 
  'dispatch_offers' as table_name, COUNT(*) as count FROM dispatch_offers
UNION ALL
SELECT 
  'payments' as table_name, COUNT(*) as count FROM payments
UNION ALL
SELECT 
  'driver_depot_orders' as table_name, COUNT(*) as count FROM driver_depot_orders
UNION ALL
SELECT 
  'delivery_addresses' as table_name, COUNT(*) as count FROM delivery_addresses
UNION ALL
SELECT 
  'pricing_history' as table_name, COUNT(*) as count FROM pricing_history
UNION ALL
SELECT 
  'driver_pricing' as table_name, COUNT(*) as count FROM driver_pricing;

-- All counts should be 0

