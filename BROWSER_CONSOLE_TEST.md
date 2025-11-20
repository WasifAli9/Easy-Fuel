# 🔍 Browser Console Test - Verify Auto-Refresh

## ✅ **How to Test if Auto-Refresh is Working**

### **Step 1: Open Browser Console**
1. Press **F12** to open Developer Tools
2. Click on the **Console** tab

### **Step 2: Check for Logs**
When you add an address, you should see these logs:

```
✅ Address created, refetching...
✅ Refetch complete!
```

### **Step 3: Monitor Network Requests**
1. Click on the **Network** tab
2. Filter by "addresses"
3. Add a new address
4. You should see:
   - **POST** `/api/addresses` (creating the address)
   - **GET** `/api/addresses` (refetching the list)

---

## 🧪 **Full Test Procedure**

### **Test 1: Add Address**
1. Go to `http://localhost:5002/customer/addresses`
2. Open Console (F12)
3. Click "+ Add Address"
4. Fill the form with test data:
   - Label: "Test Address"
   - Street: "123 Test St"
   - City: "Johannesburg"
   - Province: "Gauteng"
   - Postal Code: "2000"
5. Click "Add Address"
6. **Expected Result:**
   - ✅ Console shows: "✅ Address created, refetching..."
   - ✅ Console shows: "✅ Refetch complete!"
   - ✅ Toast notification: "Success - Address added successfully"
   - ✅ **New address appears in the list IMMEDIATELY (no F5!)**

### **Test 2: Edit Address**
1. Click "Edit" on any address
2. Change the label
3. Click "Save"
4. **Expected Result:**
   - ✅ Console shows: "✅ Address updated, refetching..."
   - ✅ Console shows: "✅ Refetch complete!"
   - ✅ Updated address shows immediately

### **Test 3: Delete Address**
1. Click "Delete" on any address
2. Confirm deletion
3. **Expected Result:**
   - ✅ Address disappears immediately

---

## 🔧 **If It's Still Not Working:**

### **Solution 1: Hard Refresh**
```
Press: Ctrl + Shift + R (Windows)
or: Cmd + Shift + R (Mac)
```

### **Solution 2: Clear Browser Cache**
Paste this in Console and press Enter:
```javascript
localStorage.clear();
sessionStorage.clear();
window.location.reload(true);
```

### **Solution 3: Check React Query DevTools**
In console, type:
```javascript
window.__REACT_QUERY_DEVTOOLS__ = true;
```
Then refresh the page.

### **Solution 4: Force Refetch**
Paste this in Console to manually trigger a refetch:
```javascript
// Get the query client
const queryClient = window.__REACT_QUERY_CLIENT__;
if (queryClient) {
  await queryClient.refetchQueries({ queryKey: ["/api/addresses"] });
  console.log("✅ Manual refetch triggered!");
} else {
  console.log("❌ Query client not found");
}
```

---

## 📊 **What You Should See**

### **Console Output (Good):**
```
✅ Address created, refetching...
✅ Refetch complete!
```

### **Network Tab (Good):**
```
POST /api/addresses   200 OK  (50ms)
GET  /api/addresses   200 OK  (20ms)  ← This is the refetch!
```

### **Page Behavior (Good):**
- ✅ Success toast appears
- ✅ Dialog closes
- ✅ New address visible in list immediately
- ✅ No manual F5 needed

---

## ❌ **Troubleshooting**

### **If you see no console logs:**
**Problem**: Old code is cached
**Solution**: 
1. Hard refresh (Ctrl + Shift + R)
2. Check that dev server is running
3. Look for `[vite] connected` in console

### **If refetch happens but address doesn't appear:**
**Problem**: Wrong query key
**Solution**: Check that you're on `/customer/addresses` route

### **If dialog closes but no refetch:**
**Problem**: Async issue
**Solution**: Already fixed in latest code - just need hard refresh

---

## ✅ **Success Checklist**

- [ ] Console shows "✅ Address created, refetching..."
- [ ] Console shows "✅ Refetch complete!"
- [ ] Network tab shows POST then GET request
- [ ] Toast notification appears
- [ ] Dialog closes
- [ ] **New address visible WITHOUT F5**

**If all boxes checked = Working perfectly!** 🎉

---

## 🆘 **Still Not Working?**

If after following all steps above it's still not working:

1. **Check server is running**:
   - Look for: `🚀 Server running on http://0.0.0.0:5002`

2. **Verify you're on the right page**:
   - URL should be: `http://localhost:5002/customer/addresses`

3. **Check for errors**:
   - Console (F12) - any red errors?
   - Network tab - any failed requests?

4. **Try in incognito mode**:
   - Open incognito/private window
   - Test there (no cache issues)

---

**After restarting dev server and hard refreshing browser, the auto-refresh should work immediately!** ✨

