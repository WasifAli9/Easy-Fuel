# 🔐 401 Unauthorized Error - Troubleshooting Guide

## Current Issue

**Error**: `GET /api/driver/assigned-orders 401 in 374ms :: {"error":"Unauthorized"}`

**What it means**: The request to the driver API is being rejected because authentication is failing.

---

## 🎯 Understanding the Error

The 401 error means one of these is happening:

1. ❌ **No authentication token** in the request
2. ❌ **Invalid or expired token** 
3. ❌ **Token not reaching the server** (cookie/header issues)
4. ❌ **User logged out** but frontend still making requests

---

## 🔍 Enhanced Debugging

I've added better logging to help diagnose the issue. Now when authentication fails, you'll see:

```
❌ Auth failed for GET /api/driver/assigned-orders: {
  hasAuthHeader: false,
  hasCookie: 'yes (checking for token...)',
  userAgent: 'Mozilla/5.0...'
}
```

And if no token is found:

```
⚠️  No auth token found in request: {
  hasAuthHeader: false,
  hasCookie: true,
  path: '/api/driver/assigned-orders'
}
```

**Check your terminal logs** to see which case applies.

---

## 🛠️ Common Causes & Solutions

### 1. User Not Signed In

**Symptoms**:
- 401 errors on all protected routes
- No auth header or cookie
- User sees auth page instead of dashboard

**Check**:
```bash
# Look in browser console (F12)
# Run this in console:
document.cookie
# Should see: sb-piejkqvpkxnrnudztrmt-auth-token=...
```

**Solution**:
- Sign in at: http://devportal.easyfuel.ai/auth
- Use magic link or password
- Verify you're redirected to dashboard

---

### 2. Cookie Not Being Sent

**Symptoms**:
- User is signed in (can see dashboard)
- API requests get 401
- `hasCookie: false` in server logs

**Causes**:
- SameSite cookie policy
- Cross-origin requests
- Cookie domain mismatch

**Check**:
```bash
# In browser DevTools → Application → Cookies
# Look for: sb-piejkqvpkxnrnudztrmt-auth-token
# Check domain and path settings
```

**Solution**:

Update Supabase client configuration if needed:

```typescript
// client/src/lib/supabase.ts
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: cookieStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
    flowType: 'pkce', // Add this for better security
  },
});
```

---

### 3. Token Expired

**Symptoms**:
- Was working, then stopped
- `hasAuthHeader: true` or `hasCookie: true` 
- User session is old (> 1 hour)

**Check**:
```bash
# In browser console:
const { data } = await supabase.auth.getSession()
console.log('Session:', data.session)
// Should show valid session with future expires_at
```

**Solution**:
- Supabase should auto-refresh tokens
- Force refresh: Sign out and sign in again
- Check if `autoRefreshToken: true` in Supabase client config

---

### 4. Authorization Header Not Sent

**Symptoms**:
- `hasAuthHeader: false`
- Using fetch/axios directly without headers

**Check your API calls**:

```typescript
// ❌ Wrong - no auth header
fetch('/api/driver/assigned-orders')

// ✅ Correct - with auth header
const { data: { session } } = await supabase.auth.getSession();
fetch('/api/driver/assigned-orders', {
  headers: {
    'Authorization': `Bearer ${session?.access_token}`
  }
})
```

**Or use Supabase client** (recommended):
```typescript
// Supabase client automatically includes auth
const { data, error } = await supabase
  .from('orders')
  .select('*')
```

---

### 5. Cookie Storage Not Working

**Symptoms**:
- `hasCookie: false` consistently
- Token not persisting between page loads

**Check CookieStorage implementation**:

```bash
# Verify file exists and is correct
cat client/src/lib/cookie-storage.ts
```

**Potential fix** - Update cookie-storage.ts:

```typescript
export class CookieStorage {
  getItem(key: string): string | null {
    const matches = document.cookie.match(
      new RegExp(`(?:^|; )${key.replace(/([\.$?*|{}\(\)\[\]\\\/\+^])/g, '\\$1')}=([^;]*)`)
    );
    return matches ? decodeURIComponent(matches[1]) : null;
  }

  setItem(key: string, value: string): void {
    // Set cookie with longer expiry and proper attributes
    const date = new Date();
    date.setFullYear(date.getFullYear() + 1); // 1 year
    document.cookie = `${key}=${encodeURIComponent(value)}; expires=${date.toUTCString()}; path=/; SameSite=Lax`;
  }

  removeItem(key: string): void {
    document.cookie = `${key}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;`;
  }
}
```

---

### 6. Supabase Session Lost

**Symptoms**:
- User signed in but backend can't validate token
- Token validation fails with error

**Check**:
```typescript
// In browser console:
const { data, error } = await supabase.auth.getUser();
console.log('User:', data.user);
console.log('Error:', error);
```

**Solution**:
1. Sign out completely
2. Clear cookies (DevTools → Application → Clear storage)
3. Sign in again
4. Test API call

---

## 🧪 Testing Authentication

### Test 1: Check if User is Signed In (Frontend)

Open browser console on your app and run:

```javascript
// Get current session
const { data: { session } } = await supabase.auth.getSession();
console.log('Session:', session);

// Should show:
// - access_token: "ey..."
// - refresh_token: "..."
// - expires_at: (future timestamp)
// - user: { id: "...", email: "..." }

// If null or expired, user needs to sign in
```

### Test 2: Check if Token is in Cookie

```javascript
// Check for Supabase auth cookie
const cookies = document.cookie.split(';');
const authCookie = cookies.find(c => c.includes('auth-token'));
console.log('Auth cookie:', authCookie);

// Should see: sb-piejkqvpkxnrnudztrmt-auth-token={...json...}
```

### Test 3: Manual API Call with Token

```javascript
// Get token
const { data: { session } } = await supabase.auth.getSession();
const token = session?.access_token;

// Make authenticated request
fetch('/api/driver/assigned-orders', {
  headers: {
    'Authorization': `Bearer ${token}`
  }
})
.then(r => r.json())
.then(data => console.log('Response:', data))
.catch(err => console.error('Error:', err));

// Should get orders, not 401
```

### Test 4: Check Server Logs

Watch your terminal for the new debug messages:

```bash
# Look for these messages:
❌ Auth failed for GET /api/driver/assigned-orders
⚠️  No auth token found in request
```

This tells you exactly what's missing.

---

## 🎯 Step-by-Step Fix

### Step 1: Verify User is Signed In

1. Go to: http://devportal.easyfuel.ai
2. Should see dashboard (not landing page)
3. If on landing page → Click "Get Started" → Sign in

### Step 2: Check Browser Console

1. Press F12 to open DevTools
2. Go to Console tab
3. Run: `await supabase.auth.getSession()`
4. Should see valid session

**If no session**:
- Sign out and sign in again
- Check Supabase dashboard for user existence

### Step 3: Check Cookies

1. DevTools → Application tab
2. Left sidebar → Cookies → http://devportal.easyfuel.ai
3. Look for: `sb-piejkqvpkxnrnudztrmt-auth-token`
4. Should have valid JSON value

**If no cookie**:
- Check cookie-storage.ts implementation
- Try signing in again
- Check browser privacy settings (allow cookies)

### Step 4: Check Network Requests

1. DevTools → Network tab
2. Refresh page or navigate to driver dashboard
3. Look for `/api/driver/assigned-orders` request
4. Click on it → Headers tab
5. Check Request Headers for:
   - `Cookie: sb-piejkqvpkxnrnudztrmt-auth-token=...`
   - OR `Authorization: Bearer ey...`

**If no auth headers**:
- Frontend not sending credentials
- Check if using `credentials: 'include'` in fetch
- Check Supabase client configuration

### Step 5: Test with Postman/Thunder Client

1. Sign in to your app
2. Copy the access_token from browser console
3. Make request in Postman:
   ```
   GET http://devportal.easyfuel.ai/api/driver/assigned-orders
   Headers:
     Authorization: Bearer YOUR_ACCESS_TOKEN
   ```
4. Should get orders, not 401

**If this works but browser doesn't**:
- Issue is in frontend code
- Check how API calls are made
- Verify token is being sent

---

## 🔧 Quick Fixes

### Fix 1: Force Re-authentication

```bash
# In browser console:
await supabase.auth.signOut();
// Then sign in again via UI
```

### Fix 2: Clear All Storage

```bash
# In browser console:
localStorage.clear();
sessionStorage.clear();
document.cookie.split(";").forEach(c => {
  document.cookie = c.replace(/^ +/, "").replace(/=.*/, "=;expires=" + new Date().toUTCString() + ";path=/");
});
location.reload();
```

### Fix 3: Check API Client Code

Look for how API calls are made in frontend:

```bash
# Search for API calls
grep -r "/api/driver/assigned-orders" client/src/
```

Make sure they're using authenticated requests.

---

## 📋 Checklist

When you see 401 errors, check these:

- [ ] User is signed in (check dashboard shows user info)
- [ ] Session exists in browser (`supabase.auth.getSession()`)
- [ ] Auth cookie exists in browser (DevTools → Application → Cookies)
- [ ] Cookie is being sent with requests (Network tab → Request Headers)
- [ ] Token is valid (not expired)
- [ ] Supabase connection is working (ran connection checker)
- [ ] Server logs show why auth failed (check terminal)

---

## 🆘 Still Getting 401?

### Check These Files:

1. **client/src/lib/supabase.ts** - Supabase client config
2. **client/src/lib/cookie-storage.ts** - Cookie storage implementation  
3. **client/src/contexts/AuthContext.tsx** - Auth state management
4. **server/routes.ts** - Server auth middleware

### Get More Details:

Run in browser console:

```javascript
// Comprehensive auth check
const check = async () => {
  const { data: { session } } = await supabase.auth.getSession();
  const { data: { user } } = await supabase.auth.getUser();
  
  console.log('=== AUTH CHECK ===');
  console.log('Session exists:', !!session);
  console.log('User exists:', !!user);
  console.log('Token:', session?.access_token?.substring(0, 20) + '...');
  console.log('Expires at:', session?.expires_at);
  console.log('Is expired:', session?.expires_at ? Date.now() / 1000 > session.expires_at : 'N/A');
  console.log('Cookie:', document.cookie.includes('auth-token'));
  console.log('==================');
};
await check();
```

### Contact Support:

If still stuck after trying all fixes:
- Share the output of the auth check above
- Share server terminal logs (the new debug messages)
- Share Network tab screenshot showing the failed request

---

**Last Updated**: November 17, 2025  
**Issue**: 401 Unauthorized on driver API endpoints  
**Status**: Debugging enabled - check logs for details

