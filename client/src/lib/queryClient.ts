import { QueryClient, QueryFunction } from "@tanstack/react-query";
import { getAuthHeaders } from "./auth-headers";
import { invalidateRelatedQueries } from "./queryInvalidation";
import { withCaseAliasesDeep } from "./case-normalize";

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

  const shouldSerializeJson =
    data !== undefined &&
    !(data instanceof FormData) &&
    !(data instanceof URLSearchParams) &&
    !(data instanceof Blob) &&
    !(data instanceof ArrayBuffer) &&
    typeof data !== "string";

  const normalizedBody = shouldSerializeJson
    ? withCaseAliasesDeep(data as any)
    : data;

  const res = await fetch(url, {
    method,
    headers: cacheHeaders,
    body: shouldSerializeJson ? JSON.stringify(normalizedBody) : (data as BodyInit | null | undefined),
    credentials: "include",
    cache: "no-store", // Ensure browser doesn't cache API responses
  });

  // Handle 401 Unauthorized - auto logout if user was authenticated
  if (res.status === 401) {
    const hasAuth = !!(headers["Authorization"] || headers["authorization"]);
    if (hasAuth) {
      // User had auth headers but got 401 - token expired/invalid
      // Create error with flag so it can be caught by error handler
      const error = new Error("401: Unauthorized - Session expired");
      (error as any).status = 401;
      (error as any).hasAuthHeaders = true;
      
      // Try to trigger auto-logout handler directly (for mutations that use apiRequest)
      // The handler will be set by AutoLogoutHandler component
      if (typeof window !== 'undefined') {
        // Dispatch a custom event that AutoLogoutHandler can listen to
        window.dispatchEvent(new CustomEvent('unauthorized', { detail: error }));
      }
      
      throw error;
    }
  }

  await throwIfResNotOk(res);

  const contentType = res.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    const originalJson = res.json.bind(res);
    (res as any).json = async () => {
      const payload = await originalJson();
      return withCaseAliasesDeep(payload);
    };
  }

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

    // Handle 401 Unauthorized - auto logout if user was authenticated
    if (res.status === 401) {
      // Check if we have auth headers - if not, user is logged out (expected)
      const hasAuth = headers["Authorization"] || headers["authorization"];
      if (!hasAuth) {
        // User is logged out - return null instead of throwing
        return null;
      }
      
      // User had auth headers but got 401 - token expired/invalid, trigger auto logout
      const error = new Error("401: Unauthorized - Session expired");
      (error as any).status = 401;
      (error as any).hasAuthHeaders = true;
      
      // Dispatch custom event for immediate handling
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('unauthorized', { detail: error }));
      }
      
      // Also throw so React Query's onError handler can catch it
      throw error;
    }

    // Only throw if not 401 (we already handled 401 above)
    if (!res.ok) {
      const text = (await res.text()) || res.statusText;
      throw new Error(`${res.status}: ${text}`);
    }
    
    const payload = await res.json();
    return withCaseAliasesDeep(payload);
  };

// Global error handler for auto-logout on 401
let autoLogoutHandler: ((error: any) => void) | null = null;

export function setAutoLogoutHandler(handler: (error: any) => void) {
  autoLogoutHandler = handler;
}

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
      onError: (error: any) => {
        // Handle 401 errors with auth headers - trigger auto logout
        console.log("[QueryClient] Query error:", {
          status: error?.status,
          hasAuthHeaders: error?.hasAuthHeaders,
          message: error?.message,
          hasHandler: !!autoLogoutHandler
        });
        
        if (error?.status === 401 && error?.hasAuthHeaders && autoLogoutHandler) {
          console.log("[QueryClient] Triggering auto-logout from query error");
          autoLogoutHandler(error);
        } else if (error?.status === 401 && error?.hasAuthHeaders) {
          // Handler not set yet, dispatch event as fallback
          console.log("[QueryClient] Handler not set, dispatching unauthorized event");
          if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('unauthorized', { detail: error }));
          }
        }
      },
    },
    mutations: {
      retry: false,
      onError: (error: any) => {
        // Handle 401 errors with auth headers - trigger auto logout
        console.log("[QueryClient] Mutation error:", {
          status: error?.status,
          hasAuthHeaders: error?.hasAuthHeaders,
          message: error?.message,
          hasHandler: !!autoLogoutHandler
        });
        
        if (error?.status === 401 && error?.hasAuthHeaders && autoLogoutHandler) {
          console.log("[QueryClient] Triggering auto-logout from mutation error");
          autoLogoutHandler(error);
        } else if (error?.status === 401 && error?.hasAuthHeaders) {
          // Handler not set yet, dispatch event as fallback
          console.log("[QueryClient] Handler not set, dispatching unauthorized event");
          if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('unauthorized', { detail: error }));
          }
        }
      },
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
