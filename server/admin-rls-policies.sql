-- Admin RLS Policies - Allow admins to view and manage all data

-- Helper function to check if user is admin
CREATE OR REPLACE FUNCTION is_admin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid() AND role = 'admin'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Profiles: Admins can view all profiles
CREATE POLICY "Admins can view all profiles"
ON profiles FOR SELECT
TO authenticated
USING (is_admin());

-- Profiles: Admins can update all profiles
CREATE POLICY "Admins can update all profiles"
ON profiles FOR UPDATE
TO authenticated
USING (is_admin())
WITH CHECK (is_admin());

-- Drivers: Admins can view all drivers
CREATE POLICY "Admins can view all drivers"
ON drivers FOR SELECT
TO authenticated
USING (is_admin());

-- Drivers: Admins can update all drivers (for KYC approval)
CREATE POLICY "Admins can update all drivers"
ON drivers FOR UPDATE
TO authenticated
USING (is_admin())
WITH CHECK (is_admin());

-- Suppliers: Admins can view all suppliers
CREATE POLICY "Admins can view all suppliers"
ON suppliers FOR SELECT
TO authenticated
USING (is_admin());

-- Suppliers: Admins can update all suppliers (for KYB approval)
CREATE POLICY "Admins can update all suppliers"
ON suppliers FOR UPDATE
TO authenticated
USING (is_admin())
WITH CHECK (is_admin());

-- Customers: Admins can view all customers
CREATE POLICY "Admins can view all customers"
ON customers FOR SELECT
TO authenticated
USING (is_admin());

-- Customers: Admins can update all customers
CREATE POLICY "Admins can update all customers"
ON customers FOR UPDATE
TO authenticated
USING (is_admin())
WITH CHECK (is_admin());

-- Orders: Admins can view all orders
CREATE POLICY "Admins can view all orders"
ON orders FOR SELECT
TO authenticated
USING (is_admin());

-- App Settings: Admins can view and update settings
CREATE POLICY "Admins can view app settings"
ON app_settings FOR SELECT
TO authenticated
USING (is_admin());

CREATE POLICY "Admins can update app settings"
ON app_settings FOR UPDATE
TO authenticated
USING (is_admin())
WITH CHECK (is_admin());

-- Fuel Types: Admins can manage fuel types
CREATE POLICY "Admins can view fuel types"
ON fuel_types FOR SELECT
TO authenticated
USING (is_admin());

CREATE POLICY "Admins can insert fuel types"
ON fuel_types FOR INSERT
TO authenticated
WITH CHECK (is_admin());

CREATE POLICY "Admins can update fuel types"
ON fuel_types FOR UPDATE
TO authenticated
USING (is_admin())
WITH CHECK (is_admin());
