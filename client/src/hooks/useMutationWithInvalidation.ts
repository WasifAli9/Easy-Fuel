import { useMutation, UseMutationOptions, UseMutationResult } from "@tanstack/react-query";
import { useQueryClient } from "@tanstack/react-query";
import { invalidateRelatedQueries } from "@/lib/queryInvalidation";

/**
 * Enhanced mutation hook that automatically invalidates related queries
 * after successful mutations. This ensures state is always updated after CRUD operations.
 * 
 * @example
 * ```tsx
 * const mutation = useMutationWithInvalidation({
 *   mutationFn: async (data) => {
 *     return apiRequest("POST", "/api/orders", data);
 *   },
 *   endpoint: "/api/orders",
 *   // Optional: provide params for dynamic routes
 *   params: { id: orderId },
 * });
 * ```
 */
export function useMutationWithInvalidation<TData = unknown, TError = unknown, TVariables = void>(
  options: UseMutationOptions<TData, TError, TVariables> & {
    /**
     * The API endpoint that this mutation targets.
     * Used to determine which queries to invalidate.
     */
    endpoint: string;
    /**
     * Optional parameters for dynamic route matching (e.g., { id: "123" })
     */
    params?: Record<string, string | number>;
    /**
     * If true, automatically invalidate related queries after successful mutation.
     * Default: true
     */
    invalidateQueries?: boolean;
    /**
     * Additional query keys to invalidate beyond the automatic ones.
     */
    additionalQueryKeys?: string[][];
  }
): UseMutationResult<TData, TError, TVariables> {
  const queryClient = useQueryClient();
  const {
    endpoint,
    params,
    invalidateQueries = true,
    additionalQueryKeys,
    onSuccess,
    ...mutationOptions
  } = options;

  return useMutation<TData, TError, TVariables>({
    ...mutationOptions,
    onSuccess: async (data, variables, context) => {
      // Call the original onSuccess if provided
      if (onSuccess) {
        await onSuccess(data, variables, context);
      }

      // Automatically invalidate related queries
      if (invalidateQueries) {
        await invalidateRelatedQueries(queryClient, endpoint, params);

        // Invalidate additional query keys if provided
        if (additionalQueryKeys) {
          for (const keys of additionalQueryKeys) {
            await queryClient.invalidateQueries({ queryKey: keys });
          }
        }
      }
    },
  });
}

