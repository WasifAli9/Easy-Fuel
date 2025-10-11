# Easy Fuel Test Accounts

## Pre-Seeded Test Accounts

The following test accounts will be created when you run the seed script:

| Role | Email | Full Name | Company/Details |
|------|-------|-----------|-----------------|
| **Customer** | customer@easyfuel.ai | Test Customer | Acme Industries (VAT: 4123456789) |
| **Driver** | driver@easyfuel.ai | John Driver | Quick Delivery Transport (Vehicle: ABC 123 GP, 5000L capacity) |
| **Supplier** | supplier@easyfuel.ai | Sarah Supplier | Premium Fuel Suppliers Ltd (CIPC: 2023/123456/07) |
| **Admin** | admin@easyfuel.ai | Admin User | System Administrator |

## Running the Seed Script

### Prerequisites
1. Complete Supabase setup following `SUPABASE_SETUP.md`
2. Ensure database migration is applied
3. Make sure `SUPABASE_SERVICE_ROLE_KEY` is set in environment variables

### Execute Seed Script

```bash
tsx server/seed.ts
```

### What Gets Created

The seed script will:
1. ✅ Create default app settings (service fees, SLA timings, etc.)
2. ✅ Create default fuel types (Diesel, Petrol 95, Petrol 93, Paraffin)
3. ✅ Create 4 test user accounts in Supabase Auth
4. ✅ Create user profiles for each role
5. ✅ Create role-specific records:
   - Customer record with company details
   - Driver record with KYC approved & vehicle info
   - Supplier record with KYB approved & company info
   - (Admin has no additional record)

## Signing In

### Option 1: Magic Link (Recommended)
1. Go to the auth page: `/auth`
2. Enter one of the test emails (e.g., `customer@easyfuel.ai`)
3. Click "Send Magic Link"
4. Check your email inbox for the magic link
5. Click the link to sign in automatically

**Note**: Test accounts have email auto-confirmed, so magic links will work immediately.

### Option 2: Set Password in Supabase
1. Go to [Supabase Dashboard](https://supabase.com/dashboard)
2. Navigate to **Authentication** → **Users**
3. Find the test account
4. Click the **...** menu → **Reset Password**
5. Set a password for easier testing
6. Use email + password to sign in

## Test Account Features

### Customer Account
- ✅ Ready to place orders
- ✅ Company details pre-filled
- ✅ VAT number configured
- 📍 Dashboard: `/customer`

### Driver Account
- ✅ **KYC Status**: Approved
- ✅ Vehicle registered (ABC 123 GP)
- ✅ Capacity: 5000 liters
- ✅ Ready to accept dispatch offers
- 📍 Dashboard: `/driver`

### Supplier Account
- ✅ **KYB Status**: Approved
- ✅ CIPC registered (2023/123456/07)
- ✅ Company: Premium Fuel Suppliers Ltd
- ✅ Ready to manage depots and pricing
- 📍 Dashboard: `/supplier`

### Admin Account
- ✅ Full system access
- ✅ Can verify KYC/KYB documents
- ✅ Manage all users and orders
- 📍 Dashboard: `/admin`

## Re-running the Seed Script

The seed script is **idempotent** for test accounts:
- If a test account already exists, it will be skipped
- Default data (settings, fuel types) will be upserted
- Safe to run multiple times

## Troubleshooting

### "Failed to create auth user" Error
- Ensure `SUPABASE_SERVICE_ROLE_KEY` is set correctly
- Check that Supabase email provider is enabled
- Verify database migration is applied

### "Failed to create profile" Error
- Run the foreign key SQL from `SUPABASE_SETUP.md`
- Ensure database tables exist

### Magic Link Not Working
- Check Supabase email provider settings
- Verify redirect URLs are configured
- Check spam folder for test emails

## Next Steps After Seeding

1. ✅ Sign in with test accounts
2. ✅ Verify role-specific dashboards load
3. ✅ Test navigation and auth flow
4. 🚀 Start building core features (orders, dispatch, KYC, etc.)

## Production Considerations

⚠️ **IMPORTANT**: These test accounts are for **development only**. 

Before deploying to production:
- Remove or disable test accounts
- Never use `@easyfuel.ai` emails in production
- Implement proper user registration flow
- Add email verification for real users
