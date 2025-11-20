import { QueryClient } from "@tanstack/react-query";

/**
 * Maps API endpoints to their related query keys that should be invalidated
 * when operations are performed on those endpoints.
 * 
 * This ensures that all related data is refreshed after CRUD operations.
 */
export const QUERY_INVALIDATION_MAP: Record<string, string[][]> = {
  // Orders
  "/api/orders": [
    ["/api/orders"],
    ["/api/driver/offers"],
    ["/api/driver/assigned-orders"],
    ["/api/driver/completed-orders"],
    ["/api/supplier/orders"],
  ],
  
  // Order by ID (dynamic)
  "/api/orders/:id": [
    ["/api/orders"],
    ["/api/orders/:id"],
    ["/api/orders/:id/offers"],
    ["/api/driver/offers"],
    ["/api/driver/assigned-orders"],
    ["/api/driver/stats"],
    ["/api/supplier/orders"],
  ],

  // Driver offers
  "/api/driver/offers": [
    ["/api/driver/offers"],
    ["/api/driver/stats"],
    ["/api/orders"],
  ],

  // Driver assigned orders
  "/api/driver/assigned-orders": [
    ["/api/driver/assigned-orders"],
    ["/api/driver/stats"],
    ["/api/orders"],
  ],

  // Driver completed orders
  "/api/driver/completed-orders": [
    ["/api/driver/completed-orders"],
    ["/api/driver/stats"],
    ["/api/orders"],
  ],

  // Driver profile
  "/api/driver/profile": [
    ["/api/driver/profile"],
    ["/api/driver/stats"],
  ],

  // Driver vehicles
  "/api/driver/vehicles": [
    ["/api/driver/vehicles"],
    ["/api/driver/profile"],
  ],

  // Driver pricing
  "/api/driver/pricing": [
    ["/api/driver/pricing"],
    ["/api/driver/offers"],
  ],

  // Delivery addresses
  "/api/delivery-addresses": [
    ["/api/delivery-addresses"],
    ["/api/addresses"],
    ["/api/orders"], // Orders may reference addresses
  ],

  // Addresses (alternative endpoint)
  "/api/addresses": [
    ["/api/addresses"],
    ["/api/delivery-addresses"],
    ["/api/orders"],
  ],

  // Payment methods
  "/api/payment-methods": [
    ["/api/payment-methods"],
    ["/api/orders"], // Orders reference payment methods
  ],

  // Supplier depots
  "/api/supplier/depots": [
    ["/api/supplier/depots"],
    ["/api/supplier/orders"],
    ["/api/orders"], // Depots affect order pricing
  ],

  // Supplier profile
  "/api/supplier/profile": [
    ["/api/supplier/profile"],
    ["/api/supplier/depots"],
  ],

  // Supplier orders
  "/api/supplier/orders": [
    ["/api/supplier/orders"],
    ["/api/orders"],
  ],

  // Customer profile
  "/api/customer/profile": [
    ["/api/customer/profile"],
    ["/api/orders"],
  ],

  // Admin routes
  "/api/admin/users": [
    ["/api/admin/kyc/pending"],
    ["/api/admin/customers"],
    ["/api/admin/drivers"],
    ["/api/admin/suppliers"],
  ],

  "/api/admin/kyc": [
    ["/api/admin/kyc/pending"],
    ["/api/admin/customers"],
    ["/api/admin/drivers"],
    ["/api/admin/suppliers"],
  ],

  // Notifications
  "/api/notifications": [
    ["/api/notifications"],
    ["/api/notifications/unread-count"],
  ],

  // Chat
  "/api/chat": [
    ["/api/chat/thread"],
    ["/api/orders"], // Chat is order-related
  ],

  // Fuel types
  "/api/fuel-types": [
    ["/api/fuel-types"],
    ["/api/orders"], // Orders reference fuel types
    ["/api/driver/pricing"],
    ["/api/supplier/depots"],
  ],
};

/**
 * Gets the query keys that should be invalidated for a given API endpoint.
 * Handles dynamic route parameters by replacing them with actual values.
 */
export function getQueryKeysToInvalidate(
  endpoint: string,
  params?: Record<string, string | number>
): string[][] {
  // Normalize endpoint (remove query params, trailing slashes)
  const normalizedEndpoint = endpoint.split("?")[0].replace(/\/$/, "");
  
  // Try exact match first
  if (QUERY_INVALIDATION_MAP[normalizedEndpoint]) {
    return QUERY_INVALIDATION_MAP[normalizedEndpoint].map(keys =>
      keys.map(key => {
        // Replace dynamic params like :id with actual values
        if (params) {
          return key.replace(/:(\w+)/g, (_, paramName) => {
            return params[paramName]?.toString() || `:${paramName}`;
          });
        }
        return key;
      })
    );
  }

  // Try pattern matching for dynamic routes
  for (const [pattern, queryKeys] of Object.entries(QUERY_INVALIDATION_MAP)) {
    if (pattern.includes(":id") || pattern.includes(":")) {
      // Extract the base path
      const basePath = pattern.split("/:")[0];
      if (normalizedEndpoint.startsWith(basePath)) {
        // Extract the ID from the endpoint
        const idMatch = normalizedEndpoint.match(new RegExp(`${basePath}/([^/]+)`));
        if (idMatch && idMatch[1]) {
          const id = idMatch[1];
          return queryKeys.map(keys =>
            keys.map(key => key.replace(/:id/g, id))
          );
        }
      }
    }
  }

  // Default: invalidate the endpoint itself and common related queries
  return [
    [normalizedEndpoint],
    ["/api/orders"], // Most operations affect orders
  ];
}

/**
 * Invalidates all related queries for a given API endpoint.
 * This should be called after successful CRUD operations.
 * 
 * Uses refetchType: 'active' to ensure active queries are refetched immediately,
 * bypassing staleTime and ensuring UI updates right away.
 */
export async function invalidateRelatedQueries(
  queryClient: QueryClient,
  endpoint: string,
  params?: Record<string, string | number>
): Promise<void> {
  const queryKeys = getQueryKeysToInvalidate(endpoint, params);
  
  // Invalidate all related queries and refetch active ones immediately
  for (const keys of queryKeys) {
    await queryClient.invalidateQueries({ 
      queryKey: keys,
      refetchType: 'active' // Refetch active queries immediately, bypassing staleTime
    });
  }
}

