/**
 * Auto-logout utility to handle 401 Unauthorized errors
 * Automatically logs out user when they receive 401 errors with valid auth headers
 * (indicating token expired or invalid, not just logged out)
 */

let logoutInProgress = false;
let lastLogoutAttempt = 0;
const LOGOUT_COOLDOWN = 5000; // Prevent multiple logout attempts within 5 seconds

/**
 * Handles automatic logout when 401 Unauthorized is received
 * @param hasAuthHeaders - Whether auth headers were present in the request
 * @param signOut - Function to sign out the user
 * @param redirectToLogin - Function to redirect to login page
 */
export async function handleUnauthorized(
  hasAuthHeaders: boolean,
  signOut: () => Promise<void>,
  redirectToLogin: () => void
): Promise<void> {
  // If no auth headers, user is already logged out (expected 401)
  if (!hasAuthHeaders) {
    return;
  }

  // Prevent multiple logout attempts
  const now = Date.now();
  if (logoutInProgress || (now - lastLogoutAttempt < LOGOUT_COOLDOWN)) {
    return;
  }

  logoutInProgress = true;
  lastLogoutAttempt = now;

  try {
    console.warn("[Auto-Logout] 401 Unauthorized received with valid auth headers. Token may be expired or invalid. Logging out...");
    
    // Sign out the user
    await signOut();
    
    // Clear all query cache
    const { queryClient } = await import("./queryClient");
    queryClient.clear();
    
    // Redirect to login page
    redirectToLogin();
  } catch (error) {
    console.error("[Auto-Logout] Error during automatic logout:", error);
    // Even if logout fails, try to redirect
    redirectToLogin();
  } finally {
    // Reset flag after a delay to allow redirect
    setTimeout(() => {
      logoutInProgress = false;
    }, 1000);
  }
}

