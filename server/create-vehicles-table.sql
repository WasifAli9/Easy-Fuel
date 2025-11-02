-- Create vehicles table for Easy Fuel ZA
-- This table stores driver vehicles with compliance information

-- Create vehicles table
CREATE TABLE IF NOT EXISTS vehicles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id UUID NOT NULL REFERENCES drivers(id) ON DELETE CASCADE,
  registration_number TEXT NOT NULL,
  make TEXT,
  model TEXT,
  year INTEGER,
  capacity_litres INTEGER,
  fuel_types TEXT[],  -- Array of fuel type IDs
  license_disk_expiry TIMESTAMP,
  roadworthy_expiry TIMESTAMP,
  insurance_expiry TIMESTAMP,
  tracker_installed BOOLEAN DEFAULT false,
  tracker_provider TEXT,
  vehicle_registration_cert_doc_id UUID,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_vehicles_driver_id ON vehicles(driver_id);
CREATE INDEX IF NOT EXISTS idx_vehicles_registration_number ON vehicles(registration_number);

-- Add RLS (Row Level Security) policies
ALTER TABLE vehicles ENABLE ROW LEVEL SECURITY;

-- Policy: Drivers can view their own vehicles
CREATE POLICY "Drivers can view their own vehicles"
  ON vehicles
  FOR SELECT
  USING (
    driver_id IN (
      SELECT id FROM drivers WHERE user_id = auth.uid()
    )
  );

-- Policy: Drivers can insert their own vehicles
CREATE POLICY "Drivers can insert their own vehicles"
  ON vehicles
  FOR INSERT
  WITH CHECK (
    driver_id IN (
      SELECT id FROM drivers WHERE user_id = auth.uid()
    )
  );

-- Policy: Drivers can update their own vehicles
CREATE POLICY "Drivers can update their own vehicles"
  ON vehicles
  FOR UPDATE
  USING (
    driver_id IN (
      SELECT id FROM drivers WHERE user_id = auth.uid()
    )
  )
  WITH CHECK (
    driver_id IN (
      SELECT id FROM drivers WHERE user_id = auth.uid()
    )
  );

-- Policy: Drivers can delete their own vehicles
CREATE POLICY "Drivers can delete their own vehicles"
  ON vehicles
  FOR DELETE
  USING (
    driver_id IN (
      SELECT id FROM drivers WHERE user_id = auth.uid()
    )
  );

-- Policy: Admins can view all vehicles
CREATE POLICY "Admins can view all vehicles"
  ON vehicles
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM admins WHERE user_id = auth.uid()
    )
  );

-- Policy: Admins can update all vehicles
CREATE POLICY "Admins can update all vehicles"
  ON vehicles
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM admins WHERE user_id = auth.uid()
    )
  );

-- Trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_vehicles_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER vehicles_updated_at
  BEFORE UPDATE ON vehicles
  FOR EACH ROW
  EXECUTE FUNCTION update_vehicles_updated_at();

-- Notify PostgREST to reload schema cache
NOTIFY pgrst, 'reload schema';
