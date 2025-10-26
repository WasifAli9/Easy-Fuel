-- Manual SQL Script to Create Driver Dashboard Test Data
-- Run this in your Supabase SQL Editor (https://supabase.com/dashboard)
-- This bypasses the PostgREST schema cache issue

-- 1. Get the first driver ID (your logged-in driver)
DO $$
DECLARE
  v_driver_id UUID;
  v_customer_id UUID;
  v_fuel_type_id UUID;
  v_order_id_1 UUID;
  v_order_id_2 UUID;
BEGIN
  -- Find first driver
  SELECT id INTO v_driver_id FROM drivers LIMIT 1;
  
  IF v_driver_id IS NULL THEN
    RAISE EXCEPTION 'No driver found. Please log in and complete driver role setup first.';
  END IF;
  
  RAISE NOTICE 'Using driver ID: %', v_driver_id;
  
  -- Find first customer
  SELECT id INTO v_customer_id FROM customers LIMIT 1;
  
  IF v_customer_id IS NULL THEN
    RAISE EXCEPTION 'No customer found. Please create a customer profile first.';
  END IF;
  
  RAISE NOTICE 'Using customer ID: %', v_customer_id;
  
  -- Find first fuel type
  SELECT id INTO v_fuel_type_id FROM fuel_types LIMIT 1;
  
  IF v_fuel_type_id IS NULL THEN
    RAISE EXCEPTION 'No fuel types found.';
  END IF;
  
  RAISE NOTICE 'Using fuel type ID: %', v_fuel_type_id;
  
  -- Create Active Job #1 (assigned state)
  INSERT INTO orders (
    customer_id, fuel_type_id, litres,
    pickup_lat, pickup_lng, drop_lat, drop_lng,
    fuel_price_cents, delivery_fee_cents, service_fee_cents, total_cents,
    state, driver_id, payment_method, payment_status
  ) VALUES (
    v_customer_id, v_fuel_type_id, 500,
    -26.0000, 28.0000, -26.1076, 28.0567,
    1050000, 35000, 22050, 1107050,
    'assigned', v_driver_id, 'credit_card', 'paid'
  );
  
  RAISE NOTICE 'Created Active Job #1 (assigned)';
  
  -- Create Active Job #2 (picked_up state)
  INSERT INTO orders (
    customer_id, fuel_type_id, litres,
    pickup_lat, pickup_lng, drop_lat, drop_lng,
    fuel_price_cents, delivery_fee_cents, service_fee_cents, total_cents,
    state, driver_id, payment_method, payment_status
  ) VALUES (
    v_customer_id, v_fuel_type_id, 1000,
    -26.0000, 28.0000, -26.1076, 28.0567,
    2100000, 45000, 42900, 2187900,
    'picked_up', v_driver_id, 'eft', 'paid'
  );
  
  RAISE NOTICE 'Created Active Job #2 (picked_up)';
  
  -- Create Completed Job #1
  INSERT INTO orders (
    customer_id, fuel_type_id, litres,
    pickup_lat, pickup_lng, drop_lat, drop_lng,
    fuel_price_cents, delivery_fee_cents, service_fee_cents, total_cents,
    state, driver_id, payment_method, payment_status
  ) VALUES (
    v_customer_id, v_fuel_type_id, 750,
    -26.0000, 28.0000, -26.1076, 28.0567,
    1575000, 40000, 32300, 1647300,
    'delivered', v_driver_id, 'credit_card', 'paid'
  );
  
  RAISE NOTICE 'Created Completed Job #1';
  
  -- Create Completed Job #2
  INSERT INTO orders (
    customer_id, fuel_type_id, litres,
    pickup_lat, pickup_lng, drop_lat, drop_lng,
    fuel_price_cents, delivery_fee_cents, service_fee_cents, total_cents,
    state, driver_id, payment_method, payment_status
  ) VALUES (
    v_customer_id, v_fuel_type_id, 300,
    -26.0000, 28.0000, -26.1076, 28.0567,
    630000, 28000, 13160, 671160,
    'delivered', v_driver_id, 'eft', 'paid'
  );
  
  RAISE NOTICE 'Created Completed Job #2';
  
  -- Create Available Job Order #1
  INSERT INTO orders (
    customer_id, fuel_type_id, litres,
    pickup_lat, pickup_lng, drop_lat, drop_lng,
    fuel_price_cents, delivery_fee_cents, service_fee_cents, total_cents,
    state, payment_method, payment_status
  ) VALUES (
    v_customer_id, v_fuel_type_id, 600,
    -26.0000, 28.0000, -26.1076, 28.0567,
    1260000, 38000, 25960, 1323960,
    'pending_dispatch', 'credit_card', 'paid'
  )
  RETURNING id INTO v_order_id_1;
  
  -- Create dispatch offer for Available Job #1
  INSERT INTO dispatch_offers (order_id, driver_id, state, expires_at)
  VALUES (
    v_order_id_1, 
    v_driver_id, 
    'pending', 
    NOW() + INTERVAL '15 minutes'
  );
  
  RAISE NOTICE 'Created Available Job #1 with dispatch offer';
  
  -- Create Available Job Order #2
  INSERT INTO orders (
    customer_id, fuel_type_id, litres,
    pickup_lat, pickup_lng, drop_lat, drop_lng,
    fuel_price_cents, delivery_fee_cents, service_fee_cents, total_cents,
    state, payment_method, payment_status
  ) VALUES (
    v_customer_id, v_fuel_type_id, 800,
    -26.0000, 28.0000, -26.1076, 28.0567,
    1680000, 42000, 34440, 1756440,
    'pending_dispatch', 'eft', 'paid'
  )
  RETURNING id INTO v_order_id_2;
  
  -- Create dispatch offer for Available Job #2
  INSERT INTO dispatch_offers (order_id, driver_id, state, expires_at)
  VALUES (
    v_order_id_2, 
    v_driver_id, 
    'pending', 
    NOW() + INTERVAL '15 minutes'
  );
  
  RAISE NOTICE 'Created Available Job #2 with dispatch offer';
  
  RAISE NOTICE '✅ Successfully created test data!';
  RAISE NOTICE '   - Active jobs: 2 (assigned, picked_up)';
  RAISE NOTICE '   - Completed jobs: 2 (delivered)';
  RAISE NOTICE '   - Available jobs: 2 (pending dispatch offers)';
  RAISE NOTICE '🎯 Refresh the driver dashboard to see the new jobs!';
  
END $$;
