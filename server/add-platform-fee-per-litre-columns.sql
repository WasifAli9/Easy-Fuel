-- Per-litre platform commission (default R1.00/L = 100 cents)
-- Run against the app database if drizzle push has not already added these columns.

ALTER TABLE app_settings
  ADD COLUMN IF NOT EXISTS customer_order_platform_fee_per_litre_cents integer NOT NULL DEFAULT 100;

ALTER TABLE app_settings
  ADD COLUMN IF NOT EXISTS depot_order_platform_fee_per_litre_cents integer NOT NULL DEFAULT 100;

UPDATE app_settings
SET
  customer_order_platform_fee_per_litre_cents = COALESCE(customer_order_platform_fee_per_litre_cents, 100),
  depot_order_platform_fee_per_litre_cents = COALESCE(depot_order_platform_fee_per_litre_cents, 100)
WHERE id = 1;
