# Quick Fix: Notifications Not Working

## The Error
```
Error creating notification: {
  code: 'PGRST205',
  message: "Could not find the table 'public.notifications' in the schema cache"
}
```

## Immediate Fix (2 minutes)

### Option 1: Run the Quick Fix Script (Recommended)

1. Open **Supabase Dashboard** → **SQL Editor**
2. Open the file: `server/verify-and-fix-notifications.sql`
3. Copy the **entire contents** and paste into SQL Editor
4. Click **"Run"** or press `Ctrl+Enter`
5. **Wait 15 seconds** for the schema cache to reload
6. Test notifications again

### Option 2: Run the Full Migration

1. Open **Supabase Dashboard** → **SQL Editor**
2. Open the file: `server/create-notifications-table.sql`
3. Copy the **entire contents** and paste into SQL Editor
4. Click **"Run"**
5. **Wait 15 seconds** for the schema cache to reload
6. Test notifications again

## Verify It Worked

After running the SQL:

1. Go to **Supabase Dashboard** → **Table Editor**
2. Look for the `notifications` table in the list
3. If it exists, the fix worked!

## Still Not Working?

If you still get the error after 15 seconds:

1. **Manually reload schema cache:**
   ```sql
   NOTIFY pgrst, 'reload schema';
   ```
   Run this in SQL Editor and wait 10 seconds.

2. **Check if table actually exists:**
   ```sql
   SELECT * FROM information_schema.tables 
   WHERE table_schema = 'public' 
   AND table_name = 'notifications';
   ```
   If this returns no rows, the table wasn't created. Re-run the migration.

3. **Restart your server** - Sometimes the server needs to be restarted after schema changes.

## Why This Happens

PostgREST (Supabase's API layer) caches the database schema for performance. When you create a new table, it doesn't automatically know about it until you:
1. Create the table
2. Notify PostgREST to reload: `NOTIFY pgrst, 'reload schema';`
3. Wait for the cache to refresh (~10-15 seconds)

## After Fixing

Once the table is created and the cache is reloaded, notifications will work for:
- ✅ Customers (order updates, driver assignments, etc.)
- ✅ Drivers (dispatch offers, customer acceptances, etc.)
- ✅ Real-time WebSocket delivery
- ✅ Push notifications (if VAPID keys are configured)

