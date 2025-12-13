import { QueryClient, QueryFunction } from "@tanstack/react-query";
import { getAuthHeaders } from "./auth-headers";
import { invalidateRelatedQueries } from "./queryInvalidation";

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const text = (await res.text()) || res.statusText;
    throw new Error(`${res.status}: ${text}`);
  }
}

/**
 * Enhanced API request function that automatically invalidates related queries
 * after successful CRUD operations (POST, PUT, PATCH, DELETE).
 * 
 * This ensures the UI state is always up-to-date after database operations.
 */
export async function apiRequest(
  method: string,
  url: string,
  data?: unknown | undefined,
  options?: {
    /**
     * If true, automatically invalidate related queries after successful operation.
     * Default: true for POST, PUT, PATCH, DELETE methods
     */
    invalidateQueries?: boolean;
    /**
     * Additional parameters for dynamic route matching (e.g., { id: "123" })
     */
    params?: Record<string, string | number>;
  }
): Promise<Response> {
  let headers: HeadersInit = { "Content-Type": "application/json" };
  
  try {
    const authHeaders = await getAuthHeaders();
    headers = { ...headers, ...authHeaders };
  } catch (error) {
    // Not authenticated - continue without auth headers (will result in 401 from server)
  }

  // Add cache-busting headers to prevent service worker from caching API responses
  const cacheHeaders: HeadersInit = {
    ...headers,
    "Cache-Control": "no-cache, no-store, must-revalidate",
    "Pragma": "no-cache",
    "Expires": "0",
  };

  const res = await fetch(url, {
    method,
    headers: cacheHeaders,
    body: data ? JSON.stringify(data) : undefined,
    credentials: "include",
    cache: "no-store", // Ensure browser doesn't cache API responses
  });

  await throwIfResNotOk(res);

  // Automatically invalidate related queries for successful mutations
  const shouldInvalidate = options?.invalidateQueries !== false && 
    (method === "POST" || method === "PUT" || method === "PATCH" || method === "DELETE");
  
  if (shouldInvalidate && res.ok) {
    // Extract ID from response if available (for dynamic routes)
    let params = options?.params;
    
    // Try to extract ID from URL if not provided
    if (!params) {
      const idMatch = url.match(/\/([a-f0-9-]{36}|[^/]+)$/i);
      if (idMatch && idMatch[1] && !idMatch[1].includes("?")) {
        params = { id: idMatch[1] };
      }
    }

    // Invalidate related queries asynchronously (don't block the response)
    invalidateRelatedQueries(queryClient, url, params).catch((error) => {
      console.warn("Failed to invalidate queries after API request:", error);
    });
  }

  return res;
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    let headers: HeadersInit = {};
    
    try {
      const authHeaders = await getAuthHeaders();
      headers = authHeaders;
    } catch (error) {
      // Not authenticated - continue without auth headers (will result in 401 from server)
    }

    // Add cache-busting headers for API requests
    const cacheHeaders: HeadersInit = {
      ...headers,
      "Cache-Control": "no-cache, no-store, must-revalidate",
      "Pragma": "no-cache",
      "Expires": "0",
    };

    const res = await fetch(queryKey.join("/") as string, {
      headers: cacheHeaders,
      credentials: "include",
      cache: "no-store", // Ensure browser doesn't cache API responses
    });

    if (unauthorizedBehavior === "returnNull" && res.status === 401) {
      return null;
    }

    // Don't throw for 401 errors - they're expected when logged out
    if (res.status === 401) {
      // Check if we have auth headers - if not, user is logged out (expected)
      const hasAuth = headers["Authorization"] || headers["authorization"];
      if (!hasAuth) {
        // User is logged out - return null instead of throwing
        return null;
      }
    }

    await throwIfResNotOk(res);
    return await res.json();
  };

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: false, // Disable to prevent constant refetching
      refetchOnMount: true, // Refetch when component mounts
      refetchOnReconnect: true, // Refetch when network reconnects
      staleTime: 30 * 1000, // Consider data fresh for 30 seconds (prevents constant refetching)
      gcTime: 5 * 60 * 1000, // Keep unused data in cache for 5 minutes (renamed from cacheTime in v5)
      retry: false,
    },
    mutations: {
      retry: false,
      // Automatically invalidate related queries after successful mutations
      // This ensures state is always updated after CRUD operations
      onSuccess: async (data, variables, context) => {
        // State invalidation is handled by:
        // 1. apiRequest function for API calls
        // 2. useMutation onSuccess callbacks for explicit invalidation
        // 3. WebSocket updates via useRealtimeUpdates hook
      },
      onSettled: () => {
        // Additional cleanup can be done here if needed
      },
    },
  },
});
