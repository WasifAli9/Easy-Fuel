-- Enable RLS on profiles table if not already enabled
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist (to avoid conflicts)
DROP POLICY IF EXISTS "Users can read own profile" ON profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON profiles;
DROP POLICY IF EXISTS "Users can insert own profile" ON profiles;

-- Allow users to read their own profile
CREATE POLICY "Users can read own profile"
ON profiles FOR SELECT
TO authenticated
USING (auth.uid() = id);

-- Allow users to insert their own profile (for signup)
CREATE POLICY "Users can insert own profile"
ON profiles FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = id);

-- Allow users to update their own profile
CREATE POLICY "Users can update own profile"
ON profiles FOR UPDATE
TO authenticated
USING (auth.uid() = id)
WITH CHECK (auth.uid() = id);

-- Also add policies for other tables
-- Customers table
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read own customer record" ON customers;
DROP POLICY IF EXISTS "Users can insert own customer record" ON customers;
DROP POLICY IF EXISTS "Users can update own customer record" ON customers;

CREATE POLICY "Users can read own customer record"
ON customers FOR SELECT
TO authenticated
USING (user_id = auth.uid());

CREATE POLICY "Users can insert own customer record"
ON customers FOR INSERT
TO authenticated
WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own customer record"
ON customers FOR UPDATE
TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

-- Drivers table
ALTER TABLE drivers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read own driver record" ON drivers;
DROP POLICY IF EXISTS "Users can insert own driver record" ON drivers;
DROP POLICY IF EXISTS "Users can update own driver record" ON drivers;

CREATE POLICY "Users can read own driver record"
ON drivers FOR SELECT
TO authenticated
USING (user_id = auth.uid());

CREATE POLICY "Users can insert own driver record"
ON drivers FOR INSERT
TO authenticated
WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own driver record"
ON drivers FOR UPDATE
TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

-- Suppliers table
ALTER TABLE suppliers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read own supplier record" ON suppliers;
DROP POLICY IF EXISTS "Users can insert own supplier record" ON suppliers;
DROP POLICY IF EXISTS "Users can update own supplier record" ON suppliers;

CREATE POLICY "Users can read own supplier record"
ON suppliers FOR SELECT
TO authenticated
USING (owner_id = auth.uid());

CREATE POLICY "Users can insert own supplier record"
ON suppliers FOR INSERT
TO authenticated
WITH CHECK (owner_id = auth.uid());

CREATE POLICY "Users can update own supplier record"
ON suppliers FOR UPDATE
TO authenticated
USING (owner_id = auth.uid())
WITH CHECK (owner_id = auth.uid());
