# 🔧 Supabase Configuration - Visual Step-by-Step Guide

## Prerequisites
- Supabase account with Easy Fuel project
- Access to Supabase Dashboard: https://supabase.com/dashboard
- Your production URL: `http://devportal.easyfuel.ai`

---

## 🎯 Overview: What We're Fixing

| Issue | Current State | Target State |
|-------|--------------|--------------|
| Magic Link | ❌ Not working | ✅ Working |
| Email Confirmation | ❌ Not required | ✅ Required for new users |
| Redirect URLs | ❌ Not configured | ✅ Configured for production |

**Time Required**: 5-10 minutes
**Code Changes**: None required!

---

## 📍 Step 1: Access Supabase Dashboard

1. Go to: https://supabase.com/dashboard
2. Sign in to your account
3. Select your **Easy Fuel** project
4. You should see the project dashboard

---

## 📍 Step 2: Configure Site URL

### Navigation Path:
```
Project Dashboard → Authentication (left sidebar) → URL Configuration
```

### What to Do:
1. In the **URL Configuration** section
2. Find the **Site URL** field
3. Enter: `http://devportal.easyfuel.ai`
4. ⚠️ **CRITICAL**: No trailing slash! 
5. ✅ Correct: `http://devportal.easyfuel.ai`
6. ❌ Wrong: `http://devportal.easyfuel.ai/`

### What This Does:
- Sets the default URL for your application
- Used as the base for all email template links
- Required for magic links to work correctly

---

## 📍 Step 3: Configure Redirect URLs

### Still in URL Configuration:

### What to Do:
1. Scroll down to **Redirect URLs** section
2. You'll see a text area (may have existing URLs)
3. Add these URLs (one per line):

```
http://devportal.easyfuel.ai/**
http://localhost:5000/**
http://localhost:5002/**
https://*.replit.dev/**
```

4. Click **Save** at the bottom of the page

### What This Does:
- Whitelists URLs that can receive authentication callbacks
- The `/**` means "any path under this domain"
- Prevents redirect attacks to unauthorized domains

### Visual Example:
```
┌─────────────────────────────────────────┐
│ Redirect URLs                            │
├─────────────────────────────────────────┤
│ http://devportal.easyfuel.ai/**         │
│ http://localhost:5000/**                 │
│ http://localhost:5002/**                 │
│ https://*.replit.dev/**                  │
└─────────────────────────────────────────┘
        [Save]
```

---

## 📍 Step 4: Enable Email Confirmation

### Navigation Path:
```
Project Dashboard → Authentication → Providers
```

### What to Do:
1. Find **Email** in the list of providers
2. Click the **Edit** button (pencil icon) on the right
3. A modal/panel will open with email settings
4. Make sure these checkboxes are **checked**:

```
☑ Enable Email provider
☑ Confirm email                    ← THIS IS THE KEY ONE!
☑ Enable Email OTP
☑ Secure email change              ← Recommended
```

5. Click **Save** or **Update** at the bottom

### What This Does:
- **Enable Email provider**: Allows email-based authentication
- **Confirm email**: Requires users to verify email before signing in
- **Enable Email OTP**: Enables magic link authentication
- **Secure email change**: Requires confirmation for email changes

### Important Notes:
- ✅ **For Production**: MUST enable "Confirm email"
- ⚠️ **For Development**: Can disable for faster testing
- 📝 Only affects NEW users created after enabling
- 👥 Existing users can still sign in normally

---

## 📍 Step 5: Update Email Templates (Recommended)

### Navigation Path:
```
Project Dashboard → Authentication → Email Templates
```

### Templates to Update:

#### Template 1: Confirm signup
1. Click on **Confirm signup** template
2. Find the confirmation URL in the HTML
3. Change it to:
```html
{{ .SiteURL }}/auth?token={{ .Token }}&type=signup
```

#### Template 2: Magic Link
1. Click on **Magic Link** template
2. Find the magic link URL
3. Change it to:
```html
{{ .SiteURL }}/auth?token={{ .Token }}&type=magiclink
```

#### Template 3: Change Email Address
1. Click on **Change Email Address** template
2. Find the confirmation URL
3. Change it to:
```html
{{ .SiteURL }}/auth?token={{ .Token }}&type=email_change
```

#### Template 4: Reset Password
1. Click on **Reset Password** template
2. Find the reset URL
3. Change it to:
```html
{{ .SiteURL }}/reset-password?token={{ .Token }}&type=recovery
```

### What This Does:
- Uses the Site URL you configured in Step 2
- Ensures all email links point to correct production domain
- Makes emails work consistently across environments

### Tips:
- The `{{ .SiteURL }}` variable automatically uses your configured Site URL
- The `{{ .Token }}` variable is the auth token
- The `type` parameter tells your app what kind of link it is

---

## 📍 Step 6: Verify Configuration

### Use the Built-in Health Check:

1. Go to: `http://devportal.easyfuel.ai/auth-test`
2. Click **"Run Health Checks"**
3. Review the results
4. All checks should pass (✅) or show warnings (⚠️)

### Manual Verification:

Check these in Supabase Dashboard:

```
✓ Site URL = http://devportal.easyfuel.ai
✓ Redirect URLs contains http://devportal.easyfuel.ai/**
✓ Email provider: Confirm email is CHECKED
✓ Email provider: Enable Email OTP is CHECKED
✓ Email templates use {{ .SiteURL }}
```

---

## 📍 Step 7: Test the Configuration

### Test 1: Magic Link (5 minutes)

1. **Send Magic Link**:
   - Go to: http://devportal.easyfuel.ai/auth
   - Enter your email address
   - Click "Send Magic Link"
   - Should see: "Check your email" message

2. **Check Email**:
   - Open your email inbox
   - Look for email from Supabase
   - Subject: "Magic Link - Easy Fuel ZA" (or similar)
   - Check spam folder if not in inbox

3. **Click Magic Link**:
   - Click the link in the email
   - Should redirect to: http://devportal.easyfuel.ai
   - Should be automatically signed in
   - Should see your dashboard

### Expected Result: ✅
- Email received within 1-2 minutes
- Link works and signs you in
- Redirected to correct dashboard

### If It Doesn't Work:
- Check Site URL (no trailing slash!)
- Check Redirect URLs includes your domain
- Check spam folder
- Look at Authentication → Logs in Supabase

---

### Test 2: Email Confirmation (10 minutes)

1. **Create New Account**:
   - Go to: http://devportal.easyfuel.ai/auth
   - Use a **NEW email** you haven't used before
   - Enter email and password
   - Click "Sign Up"
   - Should see: "Check your email" message

2. **Try Signing In (Should Fail)**:
   - Try to sign in with the email and password
   - Should see error: "Email not confirmed" or similar
   - ✅ This is correct behavior!

3. **Check Email**:
   - Open email inbox for the NEW email
   - Look for confirmation email
   - Subject: "Confirm Your Signup" (or similar)

4. **Click Confirmation Link**:
   - Click the link in the email
   - Should redirect to: http://devportal.easyfuel.ai/auth
   - Should see: "Email confirmed" message

5. **Sign In (Should Work Now)**:
   - Now try signing in with email and password
   - Should work successfully!
   - Should be redirected to role setup page

### Expected Result: ✅
- Cannot sign in before confirming email
- Confirmation email received
- Can sign in after confirming email

### If It Doesn't Work:
- Check "Confirm email" is ENABLED in Email provider
- Make sure you're using a NEW email (not existing user)
- Check spam folder for confirmation email
- Check Authentication → Users in Supabase to see user status

---

## 🎉 Success Checklist

Mark these off as you complete them:

### Configuration:
- [ ] Site URL set to `http://devportal.easyfuel.ai` (no trailing slash)
- [ ] Redirect URLs includes `http://devportal.easyfuel.ai/**`
- [ ] "Confirm email" is ENABLED in Email provider
- [ ] "Enable Email OTP" is ENABLED in Email provider
- [ ] Email templates updated (optional but recommended)
- [ ] Changes saved in Supabase Dashboard

### Testing:
- [ ] Can send magic link from http://devportal.easyfuel.ai/auth
- [ ] Receive magic link email
- [ ] Magic link signs me in successfully
- [ ] New signup requires email confirmation
- [ ] Cannot sign in before confirming email
- [ ] Can sign in after confirming email
- [ ] Health check passes at http://devportal.easyfuel.ai/auth-test

---

## 📊 Configuration Summary

### Before Configuration:
```
❌ Magic Link: Not working
❌ Email Confirmation: Not required
❌ Site URL: Not set
❌ Redirect URLs: Not configured
```

### After Configuration:
```
✅ Magic Link: Working perfectly
✅ Email Confirmation: Required for new users
✅ Site URL: http://devportal.easyfuel.ai
✅ Redirect URLs: Properly whitelisted
✅ Enhanced Security: Email verification enabled
```

---

## 🔍 Quick Reference

### Supabase Dashboard Paths:

| Setting | Path |
|---------|------|
| Site URL | Authentication → URL Configuration → Site URL |
| Redirect URLs | Authentication → URL Configuration → Redirect URLs |
| Email Provider | Authentication → Providers → Email |
| Email Templates | Authentication → Email Templates |
| User List | Authentication → Users |
| Auth Logs | Authentication → Logs |

### Important URLs:

| Purpose | URL |
|---------|-----|
| Production App | http://devportal.easyfuel.ai |
| Auth Page | http://devportal.easyfuel.ai/auth |
| Health Check | http://devportal.easyfuel.ai/auth-test |
| Supabase Dashboard | https://supabase.com/dashboard |

---

## 🆘 Common Issues & Solutions

### Issue: "Invalid redirect URL"
**Solution**: Add your domain to Redirect URLs with `/**` at the end

### Issue: Magic link does nothing when clicked
**Solution**: Check Site URL has no trailing slash

### Issue: Not receiving emails
**Solution**: Check spam folder, check Authentication → Logs

### Issue: Email confirmation not required
**Solution**: Enable "Confirm email" in Email provider settings

### Issue: Old users not requiring confirmation
**Explanation**: This is normal - only NEW users require confirmation

---

## 📚 Additional Documentation

- **FIX_SUMMARY.md** - Quick overview of all changes
- **QUICK_FIX_GUIDE.md** - Simplified 5-minute guide
- **PRODUCTION_DEPLOYMENT_FIX.md** - Detailed technical explanation
- **SUPABASE_SETUP.md** - Complete Supabase setup guide

---

**Configuration Status**: 🟡 Pending (Complete steps above)  
**Expected Result**: 🟢 Fully functional authentication with email verification  
**Support**: Refer to Supabase documentation or community forums

---

**Remember**: No code changes needed! This is purely configuration in the Supabase Dashboard.

