# Notification System Fix

## Problem
Notifications are not being received for both drivers and customers. The error indicates:
```
Error creating notification: {
  code: 'PGRST205',
  details: null,
  hint: "Perhaps you meant the table 'public.push_subscriptions'",
  message: "Could not find the table 'public.notifications' in the schema cache"
}
```

## Root Cause
The `notifications` table (and potentially `push_subscriptions` table) does not exist in the Supabase database, even though the schema is defined in the codebase.

## Solution

### Step 1: Create the Tables
Run the SQL migration file `server/create-notifications-table.sql` in your Supabase Dashboard:

1. Go to Supabase Dashboard → SQL Editor
2. Open the file `server/create-notifications-table.sql`
3. Copy and paste the entire contents into the SQL Editor
4. Click "Run" to execute the migration

This will:
- Create the `notification_type` enum with all notification types
- Create the `notifications` table with all required columns and indexes
- Create the `push_subscriptions` table for PWA push notifications
- Set up proper RLS (Row Level Security) policies
- Grant necessary permissions
- Trigger PostgREST schema cache reload

### Step 2: Verify the Tables
After running the migration:
1. Wait ~10 seconds for the schema cache to reload
2. Check in Supabase Dashboard → Table Editor that both `notifications` and `push_subscriptions` tables exist
3. Verify the tables have the correct columns

### Step 3: Test Notifications
1. Create a test order as a customer
2. Check if the customer receives a notification
3. Check if drivers receive dispatch offer notifications
4. Verify notifications appear in the UI

## How Notifications Work

The notification system has three delivery mechanisms:

1. **Database Storage**: All notifications are stored in the `notifications` table
2. **WebSocket Delivery**: Real-time delivery for users currently connected via WebSocket
3. **Push Notification Fallback**: If user is not connected via WebSocket, a push notification is sent

### Notification Flow:
1. When an event occurs (e.g., order created, driver assigned), the code calls notification helpers
2. `notificationService.createAndSend()` is called
3. Notification is stored in the database
4. WebSocket service attempts to deliver in real-time
5. If WebSocket fails, push notification service sends a PWA push notification

## Additional Notes

- The `supabaseAdmin` client uses the service role key, which bypasses RLS policies
- RLS policies are set up for user-facing queries (via the API routes)
- The notification service handles errors gracefully - if a notification fails to send, it logs the error but doesn't break the main operation

## Troubleshooting

If notifications still don't work after creating the tables:

1. **Check VAPID Keys**: Ensure `VAPID_PUBLIC_KEY` and `VAPID_PRIVATE_KEY` are set in environment variables for push notifications
2. **Check WebSocket Connection**: Verify users are connecting to the WebSocket endpoint (`/ws`)
3. **Check Push Subscription**: Ensure users have granted notification permissions and subscribed to push notifications
4. **Check Server Logs**: Look for any errors in the notification service logs
5. **Verify User IDs**: Ensure the `userId` being passed to notification functions is correct

