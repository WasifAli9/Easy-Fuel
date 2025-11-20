# State Management with Automatic Query Invalidation

This document explains how the application ensures that state is automatically updated after every DB operation and API call.

## Overview

The application uses **React Query (TanStack Query)** for state management and automatically invalidates related queries after CRUD operations to ensure the UI always reflects the latest data.

## Key Components

### 1. Query Invalidation Mapping (`queryInvalidation.ts`)

This utility maps API endpoints to their related query keys that should be invalidated when operations are performed.

**Example:**
```typescript
"/api/orders": [
  ["/api/orders"],
  ["/api/driver/offers"],
  ["/api/driver/assigned-orders"],
  ["/api/supplier/orders"],
]
```

When an order is created, updated, or deleted, all related queries are automatically invalidated.

### 2. Enhanced API Request (`queryClient.ts`)

The `apiRequest` function automatically invalidates related queries after successful CRUD operations (POST, PUT, PATCH, DELETE).

**Usage:**
```typescript
// Automatically invalidates related queries
await apiRequest("POST", "/api/orders", orderData);

// Disable automatic invalidation if needed
await apiRequest("POST", "/api/orders", orderData, { 
  invalidateQueries: false 
});

// Provide params for dynamic routes
await apiRequest("PATCH", `/api/orders/${orderId}`, data, {
  params: { id: orderId }
});
```

### 3. Enhanced Mutation Hook (`useMutationWithInvalidation.ts`)

A React Query mutation hook that automatically invalidates related queries.

**Usage:**
```typescript
import { useMutationWithInvalidation } from "@/hooks/useMutationWithInvalidation";

const mutation = useMutationWithInvalidation({
  mutationFn: async (data) => {
    return apiRequest("POST", "/api/orders", data);
  },
  endpoint: "/api/orders",
  // Optional: provide params for dynamic routes
  params: { id: orderId },
  // Optional: additional query keys to invalidate
  additionalQueryKeys: [["/api/custom-query"]],
});
```

### 4. WebSocket Real-time Updates (`useRealtimeUpdates.ts`)

The application also uses WebSocket updates to invalidate queries when changes occur from other clients or server-side events.

## How It Works

### Automatic State Updates

1. **API Calls via `apiRequest`:**
   - After a successful POST/PUT/PATCH/DELETE request
   - The function automatically determines which queries to invalidate
   - Related queries are invalidated asynchronously (non-blocking)

2. **Mutations via `useMutationWithInvalidation`:**
   - Automatically invalidates related queries in the `onSuccess` callback
   - Can specify additional query keys to invalidate

3. **Direct Supabase Operations:**
   - Operations in `AuthContext` manually invalidate related queries
   - Profile updates trigger invalidation of profile-related queries

4. **WebSocket Updates:**
   - Real-time events from the server trigger query invalidation
   - Ensures UI updates when changes occur from other clients

### Query Invalidation Flow

```
DB Operation / API Call
    ↓
apiRequest / useMutationWithInvalidation
    ↓
getQueryKeysToInvalidate(endpoint)
    ↓
invalidateRelatedQueries(queryClient, endpoint)
    ↓
queryClient.invalidateQueries() for each related query
    ↓
React Query refetches invalidated queries
    ↓
UI automatically updates with fresh data
```

## Best Practices

### 1. Use `apiRequest` for All API Calls

Always use `apiRequest` instead of raw `fetch` to ensure automatic state updates:

```typescript
// ✅ Good
await apiRequest("POST", "/api/orders", data);

// ❌ Bad
await fetch("/api/orders", { method: "POST", body: JSON.stringify(data) });
```

### 2. Use `useMutationWithInvalidation` for Complex Mutations

For mutations that need additional query invalidation or custom logic:

```typescript
const mutation = useMutationWithInvalidation({
  mutationFn: async (data) => apiRequest("POST", "/api/orders", data),
  endpoint: "/api/orders",
  onSuccess: (data) => {
    // Custom success logic
    toast.success("Order created!");
  },
});
```

### 3. Manual Invalidation When Needed

If you need to invalidate queries manually (e.g., after direct Supabase operations):

```typescript
import { queryClient } from "@/lib/queryClient";
import { invalidateRelatedQueries } from "@/lib/queryInvalidation";

// Invalidate specific queries
await queryClient.invalidateQueries({ queryKey: ["/api/orders"] });

// Or use the utility function
await invalidateRelatedQueries(queryClient, "/api/orders", { id: orderId });
```

### 4. Adding New Endpoints

When adding new API endpoints, update `QUERY_INVALIDATION_MAP` in `queryInvalidation.ts`:

```typescript
"/api/new-endpoint": [
  ["/api/new-endpoint"],
  ["/api/related-endpoint"],
],
```

## Examples

### Creating an Order

```typescript
const createOrderMutation = useMutation({
  mutationFn: async (values) => {
    const response = await apiRequest("POST", "/api/orders", values);
    return response.json();
  },
  onSuccess: () => {
    // apiRequest automatically invalidates /api/orders and related queries
    toast.success("Order created!");
  },
});
```

### Updating a Profile

```typescript
const updateProfileMutation = useMutation({
  mutationFn: async (data) => {
    return apiRequest("PATCH", "/api/customer/profile", data);
  },
  // Automatic invalidation happens via apiRequest
});
```

### Direct Supabase Operation

```typescript
// In AuthContext
const { error } = await supabase.from("profiles").update({ ... });

// Manually invalidate related queries
await queryClient.invalidateQueries({ queryKey: ["/api/customer/profile"] });
```

## Troubleshooting

### State Not Updating After Operation

1. **Check if `apiRequest` is being used:**
   - Ensure all API calls use `apiRequest` instead of raw `fetch`

2. **Verify query keys match:**
   - Check that the query keys in your components match the invalidation map

3. **Check for manual invalidation:**
   - For direct Supabase operations, ensure manual invalidation is called

4. **Review WebSocket updates:**
   - Check if `useRealtimeUpdates` is properly set up in your app

### Performance Concerns

- Query invalidation is asynchronous and non-blocking
- React Query batches invalidations efficiently
- Only active queries are refetched automatically

## Summary

The application ensures state is always up-to-date through:

1. ✅ Automatic query invalidation in `apiRequest`
2. ✅ Enhanced mutation hook with automatic invalidation
3. ✅ Query invalidation mapping for related queries
4. ✅ WebSocket real-time updates
5. ✅ Manual invalidation for direct DB operations

This comprehensive approach ensures that **every DB operation and API call automatically updates the state**, keeping the UI in sync with the database.

