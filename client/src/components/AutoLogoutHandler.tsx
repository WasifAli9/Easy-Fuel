import { useEffect, useRef } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useLocation } from "wouter";
import { setAutoLogoutHandler, queryClient } from "@/lib/queryClient";

/**
 * Component that handles automatic logout when 401 Unauthorized errors occur
 * with valid authentication headers (indicating expired/invalid token)
 */
export function AutoLogoutHandler() {
  const { signOut, user } = useAuth();
  const [, setLocation] = useLocation();
  const logoutInProgress = useRef(false);

  const performLogout = async () => {
    // Prevent multiple logout attempts
    if (logoutInProgress.current) {
      console.log("[Auto-Logout] Logout already in progress, skipping...");
      return;
    }

    // Only auto-logout if user is currently logged in
    if (!user) {
      console.log("[Auto-Logout] No user found, skipping logout");
      return;
    }

    logoutInProgress.current = true;

    try {
      console.warn("[Auto-Logout] 401 Unauthorized with valid auth headers. Session expired. Logging out...");
      
      // Sign out the user
      await signOut();
      
      // Clear all query cache
      queryClient.clear();
      
      // Clear all browser storage
      console.log("[Auto-Logout] Clearing browser storage...");
      localStorage.clear();
      sessionStorage.clear();
      
      // Clear all caches (Cache API)
      if ('caches' in window) {
        console.log("[Auto-Logout] Clearing all caches...");
        try {
          const cacheNames = await caches.keys();
          await Promise.all(
            cacheNames.map(cacheName => {
              console.log(`[Auto-Logout] Deleting cache: ${cacheName}`);
              return caches.delete(cacheName);
            })
          );
        } catch (cacheError) {
          console.error("[Auto-Logout] Error clearing caches:", cacheError);
        }
      }
      
      // Send message to service worker to clear its caches
      if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
        console.log("[Auto-Logout] Sending clear cache message to service worker...");
        try {
          const channel = new MessageChannel();
          channel.port1.onmessage = (event) => {
            if (event.data.success) {
              console.log("[Auto-Logout] Service worker cache cleared successfully");
            }
          };
          navigator.serviceWorker.controller.postMessage(
            { type: 'CLEAR_CACHE' },
            [channel.port2]
          );
        } catch (swMessageError) {
          console.error("[Auto-Logout] Error sending message to service worker:", swMessageError);
        }
      }
    } catch (logoutError) {
      console.error("[Auto-Logout] Error during logout:", logoutError);
    } finally {
      logoutInProgress.current = false;
    }
  };

  // Check for 401 errors and perform logout if needed
  useEffect(() => {
    const handleError = (event: ErrorEvent) => {
      if (event.message.includes('401 Unauthorized')) {
        performLogout();
      }
    };

    window.addEventListener('error', handleError);

    return () => {
      window.removeEventListener('error', handleError);
    };
  }, []);
}