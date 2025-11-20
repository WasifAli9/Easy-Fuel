# 🚨 Supabase Connection Error Fix

## Error Details

**Error**: `ENOTFOUND piejkqvpkxnrnudztrmt.supabase.co`

**What it means**: Your server cannot resolve the DNS hostname for your Supabase instance. This prevents any authentication or database operations from working.

---

## 🎯 Most Likely Cause: Paused Supabase Project

**Supabase free tier projects automatically pause after 7 days of inactivity.**

### ✅ Quick Fix (2 minutes):

1. **Go to Supabase Dashboard**: https://supabase.com/dashboard
2. **Find your Easy Fuel project** (piejkqvpkxnrnudztrmt)
3. **Click on the project** - This will wake it up
4. **Wait 1-2 minutes** for the project to resume
5. **Refresh your app** - http://devportal.easyfuel.ai

You should see a message like:
- "Project is waking up..."
- "Project is now active"

---

## 🔍 Diagnose the Issue

Run this command to check your Supabase connection:

```bash
tsx server/check-supabase-connection.ts
```

This will tell you exactly what's wrong and how to fix it.

---

## 🛠️ Other Possible Causes & Solutions

### 1. Paused Supabase Project (Most Common)
**Symptoms**: Error code `ENOTFOUND`

**Solution**:
```bash
# Visit Supabase Dashboard
https://supabase.com/dashboard

# Click on your project to wake it
# Wait 1-2 minutes
```

**Prevention**:
- Upgrade to Pro plan ($25/month) for always-on projects
- Or regularly access your dashboard to keep it active

---

### 2. Network/DNS Issues
**Symptoms**: Cannot reach Supabase, DNS errors

**Test**:
```bash
# Windows Command Prompt or PowerShell:
ping piejkqvpkxnrnudztrmt.supabase.co
nslookup piejkqvpkxnrnudztrmt.supabase.co
```

**Expected Result**: Should resolve to an IP address

**If ping fails**:
- Check your internet connection
- Try accessing https://piejkqvpkxnrnudztrmt.supabase.co in a browser
- Check if you can access https://supabase.com

**Solutions**:
- Restart your network adapter
- Flush DNS cache: `ipconfig /flushdns` (Windows)
- Try a different DNS server (Google DNS: 8.8.8.8)
- Disable VPN if running

---

### 3. Firewall Blocking Connection
**Symptoms**: Connection timeout or refused

**Solution**:
- Allow outbound connections to `*.supabase.co`
- Check Windows Firewall settings
- Check antivirus firewall settings
- If on corporate network, ask IT to whitelist Supabase

**Test**:
```bash
# Try accessing Supabase directly
curl https://piejkqvpkxnrnudztrmt.supabase.co
```

---

### 4. Invalid Supabase URL
**Symptoms**: Wrong hostname in error

**Check your configuration**:
```bash
# Check what URL your app is using
grep -r "piejkqvpkxnrnudztrmt" server/
```

**Verify in Supabase Dashboard**:
1. Go to: https://supabase.com/dashboard
2. Open your project
3. Go to **Project Settings** → **API**
4. Check **Project URL** matches: `https://piejkqvpkxnrnudztrmt.supabase.co`

---

## 🔄 After Fixing

Once Supabase is accessible again:

1. **Restart your server**:
   ```bash
   # Stop the server (Ctrl+C)
   # Start it again
   npm run dev
   ```

2. **Test the connection**:
   ```bash
   tsx server/check-supabase-connection.ts
   ```

3. **Try authentication**:
   - Visit: http://devportal.easyfuel.ai/auth
   - Try sending a magic link
   - Should work now ✅

---

## 🎯 Quick Checklist

Run through this checklist to diagnose:

- [ ] Can you access https://supabase.com in your browser?
- [ ] Can you access your Supabase Dashboard?
- [ ] Does your project show as "Active" in the dashboard?
- [ ] Can you ping `piejkqvpkxnrnudztrmt.supabase.co`?
- [ ] Can you access `https://piejkqvpkxnrnudztrmt.supabase.co` in browser?
- [ ] Is your firewall allowing connections to Supabase?
- [ ] Is the SUPABASE_URL correct in your environment?

---

## 📊 Understanding Free Tier Pausing

### Supabase Free Tier Behavior:

| Status | Description |
|--------|-------------|
| **Active** | Project is running normally |
| **Pausing** | No activity for 7 days, starting to pause |
| **Paused** | Project is sleeping (free tier) |
| **Resuming** | Waking up after being accessed |

### What happens when paused:
- ❌ Database is inaccessible
- ❌ Authentication doesn't work
- ❌ API requests fail with DNS errors
- ❌ Your app shows as "not running"

### How to wake it:
1. Visit Supabase Dashboard
2. Click on the project
3. Wait 1-2 minutes
4. Project is now active ✅

### How to prevent pausing:
- Upgrade to Pro plan ($25/month) - projects never pause
- Or access your dashboard regularly to keep it active

---

## 🔧 Improved Error Handling

I've updated your code to better handle these errors:

### Changes Made:

1. **Better error messages** in `server/routes.ts`:
   - Now shows helpful diagnostic info when Supabase is unreachable
   - Distinguishes between DNS errors, timeouts, and other issues

2. **Connection checker** - `server/check-supabase-connection.ts`:
   - Run anytime to test your Supabase connection
   - Provides specific diagnostics and solutions

### Usage:

```bash
# Check if Supabase is accessible
tsx server/check-supabase-connection.ts

# Expected output if working:
# ✅ Can reach Supabase API
# ✅ Database connection working
# ✅ Supabase connection is healthy!

# Expected output if paused:
# ❌ DNS Resolution Error - Cannot find Supabase host
# 🚨 Supabase project is PAUSED
# → Visit https://supabase.com/dashboard to wake it up
```

---

## 🆘 Still Not Working?

### Check Supabase Status:
- Visit: https://status.supabase.com
- Check if there are any ongoing incidents

### Get Support:
- Supabase Discord: https://supabase.com/discord
- Supabase GitHub Discussions: https://github.com/supabase/supabase/discussions

### Temporary Workaround:
If you need immediate access and Supabase is having issues:
- Use a local development setup with Supabase CLI
- Or wait for Supabase to resolve the issue

---

## 📝 Summary

**Problem**: `ENOTFOUND piejkqvpkxnrnudztrmt.supabase.co`

**Most Likely Cause**: Paused Supabase project (free tier)

**Quick Fix**:
1. Visit https://supabase.com/dashboard
2. Click on your project
3. Wait 1-2 minutes
4. Refresh your app

**Prevention**: 
- Upgrade to Pro plan for always-on projects
- Or access dashboard regularly

**Test**:
```bash
tsx server/check-supabase-connection.ts
```

---

**Last Updated**: November 17, 2025  
**Status**: ⚠️ Connection Issue - Follow steps above to resolve

