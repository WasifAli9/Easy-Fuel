-- Manual SQL Script to Create a Vehicle
-- Run this in your Supabase SQL Editor to bypass the PostgREST schema cache
-- Replace the values below with your actual vehicle details

DO $$
DECLARE
  v_driver_id UUID;
  v_fuel_type_diesel UUID;
BEGIN
  -- Get the logged-in driver ID
  SELECT id INTO v_driver_id FROM drivers LIMIT 1;
  
  IF v_driver_id IS NULL THEN
    RAISE EXCEPTION 'No driver found. Please log in as a driver first.';
  END IF;
  
  -- Get Diesel fuel type ID (or change to your preferred fuel type)
  SELECT id INTO v_fuel_type_diesel 
  FROM fuel_types 
  WHERE name ILIKE '%diesel%' 
  LIMIT 1;
  
  -- Create the vehicle
  INSERT INTO vehicles (
    driver_id,
    registration_number,
    make,
    model,
    year,
    capacity_litres,
    fuel_types,
    license_disk_expiry,
    roadworthy_expiry,
    insurance_expiry,
    tracker_installed,
    tracker_provider
  ) VALUES (
    v_driver_id,
    'ABC1234',           -- Change to your registration number
    'Toyota',            -- Change to your make
    'Hilux',            -- Change to your model
    2020,               -- Change to your year
    5000,               -- Change to your capacity
    ARRAY[v_fuel_type_diesel], -- Fuel types array
    '2026-10-26',       -- License disk expiry
    '2026-10-26',       -- Roadworthy expiry
    '2027-02-26',       -- Insurance expiry
    true,               -- Tracker installed
    'Tracker ABC'       -- Tracker provider
  );
  
  RAISE NOTICE '✅ Vehicle created successfully!';
  RAISE NOTICE 'Registration: ABC1234';
  RAISE NOTICE 'Refresh your driver dashboard to see the vehicle.';
  
END $$;
