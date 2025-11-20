# 🔍 Authentication Token Testing Guide

## Current Issue

Auth headers and cookies are present, but token validation is failing.

**Symptoms**:
- ✅ `hasAuthHeader: true`
- ✅ `hasCookie: 'yes'`
- ❌ Still getting 401 Unauthorized

This means the **token extraction or validation** is failing.

---

## 🧪 Enhanced Debugging Active

The server now logs detailed information about token validation failures:

### Success Message:
```
✅ User authenticated: {
  userId: '...',
  email: 'user@example.com',
  path: '/api/driver/profile'
}
```

### Failure Messages:
```
🔴 Token validation failed: {
  error: 'Invalid token',
  code: 401,
  path: '/api/driver/profile',
  tokenPreview: 'eyJhbGciOiJIUzI1N...'
}
```

**Watch your terminal** - the next request will show exactly what's wrong!

---

## 🎯 Test in Browser

Open DevTools (F12) and run these tests:

### Test 1: Check Current Session
```javascript
const { data: { session }, error } = await supabase.auth.getSession();
console.log('Session:', session);
console.log('Error:', error);
console.log('Token:', session?.access_token);
console.log('Expires:', new Date(session?.expires_at * 1000));
```

**Expected**: Valid session with token and future expiry

### Test 2: Check Token in Authorization Header
```javascript
// Check what's being sent
const session = (await supabase.auth.getSession()).data.session;
console.log('Token will be sent as:', `Bearer ${session?.access_token?.substring(0, 30)}...`);
```

### Test 3: Validate Token with Supabase
```javascript
const session = (await supabase.auth.getSession()).data.session;
const { data, error } = await supabase.auth.getUser(session?.access_token);
console.log('Token is valid:', !!data.user);
console.log('User:', data.user);
console.log('Error:', error);
```

**Expected**: User object returned, no error

### Test 4: Check Cookie Format
```javascript
const cookies = document.cookie.split(';');
const authCookie = cookies.find(c => c.includes('auth-token'));
console.log('Auth cookie:', authCookie);

// Try to parse it
if (authCookie) {
  const value = authCookie.split('=')[1];
  try {
    const parsed = JSON.parse(decodeURIComponent(value));
    console.log('Cookie contains:', {
      hasAccessToken: !!parsed.access_token,
      hasRefreshToken: !!parsed.refresh_token,
      tokenPreview: parsed.access_token?.substring(0, 30)
    });
  } catch (e) {
    console.error('Cookie parse error:', e);
  }
}
```

---

## 🔧 Likely Issues & Fixes

### Issue 1: Token Expired

**Check**:
```javascript
const { data: { session } } = await supabase.auth.getSession();
const isExpired = session?.expires_at && (Date.now() / 1000 > session.expires_at);
console.log('Token expired:', isExpired);
```

**Fix**:
```javascript
// Force refresh
await supabase.auth.refreshSession();
// Or sign out and in
await supabase.auth.signOut();
// Then sign in again
```

---

### Issue 2: Invalid Token Format

**Symptoms**: Token doesn't start with "eyJ"

**Check**:
```javascript
const { data: { session } } = await supabase.auth.getSession();
console.log('Token starts correctly:', session?.access_token?.startsWith('eyJ'));
```

**Fix**: Sign out and sign in again to get a fresh token

---

### Issue 3: Authorization Header Malformed

**Check what frontend is sending**:
```javascript
// In DevTools → Network tab
// Click on a failed request
// Look at Request Headers
// Should see: Authorization: Bearer eyJ...
```

**Common mistakes**:
- Missing "Bearer " prefix
- Extra spaces
- Token truncated
- Wrong token type (refresh instead of access)

---

### Issue 4: Cookie Not Being Parsed Correctly

**Server-side issue**: The cookie parsing might be failing

**Check cookie format**:
```javascript
// Should be JSON string
const cookie = document.cookie.split(';').find(c => c.includes('auth-token'));
console.log('Cookie format valid:', {
  exists: !!cookie,
  isJSON: cookie?.includes('{') && cookie?.includes('}')
});
```

**If cookie format is wrong**, might need to fix cookie-storage.ts

---

## 🚀 Quick Fix Steps

### Step 1: Clear Everything and Re-authenticate

```javascript
// In browser console:
// 1. Sign out
await supabase.auth.signOut();

// 2. Clear storage
localStorage.clear();
sessionStorage.clear();

// 3. Clear cookies
document.cookie.split(";").forEach(c => {
  document.cookie = c.replace(/^ +/, "").replace(/=.*/, "=;expires=" + new Date().toUTCString() + ";path=/");
});

// 4. Reload
location.reload();

// 5. Sign in again via UI
```

### Step 2: Test Token Immediately After Sign In

```javascript
// Right after signing in, run:
const { data: { session } } = await supabase.auth.getSession();
const { data, error } = await supabase.auth.getUser(session?.access_token);
console.log('Fresh token valid:', !!data.user);
```

### Step 3: Test API Call with Fresh Token

```javascript
const { data: { session } } = await supabase.auth.getSession();
const response = await fetch('/api/driver/profile', {
  headers: {
    'Authorization': `Bearer ${session.access_token}`
  }
});
console.log('API Response:', await response.json());
```

---

## 📊 What The Logs Will Tell You

After the improvements, you'll see one of these:

### Scenario A: Token is Invalid/Expired
```
🔴 Token validation failed: {
  error: 'JWT expired',
  code: 401,
  ...
}
```
**Fix**: Refresh session or sign in again

### Scenario B: Token Can't Be Extracted
```
⚠️  No auth token found in request: {
  hasAuthHeader: true,
  hasCookie: true,
  ...
}
```
**Fix**: Check cookie format and Authorization header format

### Scenario C: Supabase Connection Issue
```
⚠️  Cannot reach Supabase: piejkqvpkxnrnudztrmt.supabase.co
```
**Fix**: Run `npx tsx server/check-supabase-connection.ts`

### Scenario D: Token Valid But No User
```
🔴 Token valid but no user returned
```
**Fix**: User might be deleted, check Supabase dashboard

---

## 🎯 Next Steps

1. **Check server terminal logs** for the new detailed error messages
2. **Run browser console tests** above to validate token
3. **Try the quick fix** (sign out/in)
4. **Report back** with the specific error message from logs

The enhanced logging will show us exactly what's failing! 🔍

