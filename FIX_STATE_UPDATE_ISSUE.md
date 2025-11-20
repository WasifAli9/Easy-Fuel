# Fix: State Not Updating After DB Operations

## Problem
The application was continuously refetching data but the UI wasn't updating. This was caused by:

1. **Service Worker caching API responses** - The service worker was caching API responses using `staleWhileRevalidate`, causing stale data to be served even after mutations
2. **QueryClient `staleTime: 0`** - This caused constant refetching, creating a loop with cached responses
3. **No cache-busting headers** - API requests didn't have proper cache control headers

## Solution

### 1. Service Worker - Bypass Cache for API Requests
Updated `public/service-worker.js` to never cache API requests:

```javascript
// NEVER cache API requests - always fetch from network
if (url.pathname.startsWith("/api/")) {
  event.respondWith(fetch(request));
  return;
}
```

Also updated the activate event to clear any existing API caches.

### 2. QueryClient Configuration
Updated `client/src/lib/queryClient.ts`:

- **Changed `staleTime` from `0` to `30 * 1000`** (30 seconds) - Prevents constant refetching
- **Disabled `refetchOnWindowFocus`** - Prevents refetching when window regains focus
- **Changed `cacheTime` to `gcTime`** - Updated for React Query v5
- **Added cache-busting headers** to all API requests:
  - `Cache-Control: no-cache, no-store, must-revalidate`
  - `Pragma: no-cache`
  - `Expires: 0`
  - `cache: "no-store"` in fetch options

### 3. Query Invalidation
Updated `client/src/lib/queryInvalidation.ts`:

- Added `refetchType: 'active'` to `invalidateQueries` calls
- This ensures active queries are refetched immediately, bypassing `staleTime`

## Testing

After these changes:

1. **Clear browser cache and service worker:**
   - Open DevTools → Application → Service Workers → Unregister
   - Application → Storage → Clear site data
   - Hard refresh (Ctrl+Shift+R or Cmd+Shift+R)

2. **Test a CRUD operation:**
   - Create/update/delete an order
   - Verify the UI updates immediately
   - Check Network tab - should see fresh requests, not cached responses

3. **Verify no infinite refetching:**
   - Open Network tab
   - Should see requests only when:
     - Component mounts
     - Mutation completes
     - Query is explicitly invalidated
     - Not on every render or window focus

## Key Changes Summary

✅ Service worker bypasses cache for all `/api/*` requests  
✅ QueryClient has proper `staleTime` to prevent constant refetching  
✅ All API requests have cache-busting headers  
✅ Query invalidation uses `refetchType: 'active'` for immediate updates  
✅ Service worker clears old API caches on activation  

## Notes

- The service worker will still cache static assets (JS, CSS, images) for performance
- API responses are always fetched fresh from the network
- State updates should now work correctly after all CRUD operations

