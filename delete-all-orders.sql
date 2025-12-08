-- Delete all orders and related data for testing
-- WARNING: This will permanently delete all orders, offers, and related records
-- Use with caution!

-- Delete dispatch offers first (foreign key constraint)
DELETE FROM dispatch_offers;

-- Delete order chat messages (if exists)
DELETE FROM order_messages;

-- Delete orders
DELETE FROM orders;

-- Optional: Reset sequences if you want to start IDs from 1
-- ALTER SEQUENCE orders_id_seq RESTART WITH 1;

-- Verify deletion
SELECT COUNT(*) as remaining_orders FROM orders;
SELECT COUNT(*) as remaining_offers FROM dispatch_offers;

