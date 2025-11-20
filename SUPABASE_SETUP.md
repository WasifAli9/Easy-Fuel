# Supabase Setup for Easy Fuel

## 1. Enable Email Authentication

Before using the application, you must enable email authentication in Supabase:

1. Go to your [Supabase Dashboard](https://supabase.com/dashboard)
2. Select your Easy Fuel project
3. Go to **Authentication** → **Providers**
4. Find **Email** provider and click **Edit**
5. Enable the following:
   - ✅ Enable Email provider
   - ✅ **Confirm email** ← **ENABLE for production!** (optional for development only)
   - ✅ Enable Email OTP (for magic links)
   - ✅ Secure email change (recommended for security)
6. Click **Save**

**Important**: 
- **Development**: You can disable "Confirm email" for faster testing
- **Production**: MUST enable "Confirm email" to require users to verify their email before signing in

### Configure Redirect URLs

1. Go to **Authentication** → **URL Configuration**
2. Set **Site URL** to your main application URL:
   - For development: `http://localhost:5000`
   - For production: `http://devportal.easyfuel.ai` (or your domain)
   - ⚠️ **IMPORTANT**: No trailing slash!
3. Add your application URLs to **Redirect URLs** (Allowed redirect URLs):
   - For development: `http://localhost:5000/**`
   - For Replit: `https://*.replit.dev/**`
   - For production: `http://devportal.easyfuel.ai/**` (or your domain)
4. Click **Save**

**Note**: The Site URL must match your deployment URL exactly (including http/https protocol). The redirect URLs should include `/**` wildcard to allow callbacks to any route.

## 2. Apply Database Migration

Since you're using Supabase, please follow these steps to apply the database schema:

### Method 1: Using Supabase SQL Editor (Recommended)

1. Go to your [Supabase Dashboard](https://supabase.com/dashboard)
2. Select your Easy Fuel project
3. Click **SQL Editor** in the left sidebar
4. Click **New Query**
5. Copy and paste the contents of `migrations/0000_odd_callisto.sql`
6. Click **Run** to execute the migration
7. Run this additional SQL to add foreign key constraints to auth.users:

```sql
-- Add foreign key constraints from our tables to Supabase auth.users
ALTER TABLE profiles 
  ADD CONSTRAINT profiles_id_fkey 
  FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE drivers
  ADD CONSTRAINT drivers_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE customers
  ADD CONSTRAINT customers_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE suppliers
  ADD CONSTRAINT suppliers_owner_id_fkey
  FOREIGN KEY (owner_id) REFERENCES auth.users(id) ON DELETE CASCADE;
```

### Method 2: Using Supabase CLI

```bash
# Install Supabase CLI if you haven't
npm install -g supabase

# Link to your project
supabase link --project-ref your-project-ref

# Apply migration
supabase db push
```

## 3. Seed Initial Data & Test Accounts

After applying the migration, run the seed script to create:
- Default app settings (service fees, SLA timings)
- Default fuel types (Diesel, Petrol 95, Petrol 93, Paraffin)
- **4 Pre-configured test accounts** (customer, driver, supplier, admin)

Run the seed script:

```bash
tsx server/seed.ts
```

This will create **4 test accounts** with @easyfuel.ai emails:
- `customer@easyfuel.ai` - Customer with company details
- `driver@easyfuel.ai` - Driver with approved KYC & vehicle (ABC 123 GP, 5000L)
- `supplier@easyfuel.ai` - Supplier with approved KYB & CIPC
- `admin@easyfuel.ai` - Admin user

See `TEST_ACCOUNTS.md` for complete details and sign-in instructions.

This will populate:
- Default app settings (service fee, delivery fee, dispatch radius, SLA)
- Fuel types (diesel, petrol 95/93, paraffin)

## Enable Row Level Security (RLS)

After tables are created, enable RLS in Supabase:

1. Go to **Database** → **Tables** in Supabase Dashboard
2. For each table, click the table name, then **Policies**
3. Click **Enable RLS** if not already enabled

We'll add specific RLS policies in the next steps.

## Database Connection

Your database is configured with:
- **Supabase URL**: `SUPABASE_URL`
- **Anon Key**: `SUPABASE_ANON_KEY` (client-side, respects RLS)
- **Service Role Key**: `SUPABASE_SERVICE_ROLE_KEY` (server-side, bypasses RLS)

The application is ready to use Supabase for authentication and data storage!
