# Fix DNS Resolution Issue for Supabase

## Problem
`ERR_NAME_NOT_RESOLVED` error when trying to sign up - your local DNS server cannot resolve Supabase domains.

## Quick Fix: Change DNS Server

### Windows:
1. Open **Network Settings**:
   - Press `Win + I` → **Network & Internet** → **Advanced network settings** → **More network adapter options**
   - OR Right-click network icon in system tray → **Open Network & Internet settings**

2. Change DNS:
   - Right-click your active network adapter (Wi-Fi or Ethernet)
   - Select **Properties**
   - Double-click **Internet Protocol Version 4 (TCP/IPv4)**
   - Select **Use the following DNS server addresses**
   - Enter:
     - **Preferred DNS server:** `8.8.8.8` (Google DNS)
     - **Alternate DNS server:** `8.8.4.4` (Google DNS backup)
   - OR use Cloudflare DNS:
     - **Preferred:** `1.1.1.1`
     - **Alternate:** `1.0.0.1`
   - Click **OK** on all dialogs

3. Flush DNS cache:
   - Open Command Prompt as Administrator
   - Run: `ipconfig /flushdns`

4. Restart your browser

### Alternative: Use Command Line (Admin)
```powershell
# Set DNS to Google DNS
netsh interface ip set dns "Wi-Fi" static 8.8.8.8
netsh interface ip add dns "Wi-Fi" 8.8.4.4 index=2

# Flush DNS
ipconfig /flushdns
```

## Verify Fix
After changing DNS, test in browser console:
```javascript
fetch('https://piejkqvpkxnrnudztrmt.supabase.co')
  .then(() => console.log('✅ Supabase reachable'))
  .catch(err => console.error('❌ Still failing:', err));
```

## Other Possible Issues

### 1. Supabase Project Paused
- Check your Supabase dashboard: https://supabase.com/dashboard
- If project is paused, resume it

### 2. Network Firewall/Proxy
- Check if your network has a firewall blocking Supabase
- Try using a VPN or mobile hotspot to test

### 3. Browser Cache
- Clear browser cache and cookies
- Try incognito/private mode

## Test DNS Resolution
```powershell
# Test with Google DNS
nslookup piejkqvpkxnrnudztrmt.supabase.co 8.8.8.8

# Should return an IP address (not timeout)
```

