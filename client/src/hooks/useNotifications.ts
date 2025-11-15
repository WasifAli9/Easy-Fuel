import { useQuery, useMutation } from "@tanstack/react-query";
import { useWebSocket } from "./useWebSocket";
import { useAuth } from "@/contexts/AuthContext";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useEffect, useCallback, useState } from "react";

export interface Notification {
  id: string;
  userId: string;
  type: string;
  title: string;
  message: string;
  data?: any;
  read: boolean;
  readAt?: string;
  deliveryStatus?: string;
  deliveredAt?: string;
  createdAt: string;
}

export function useNotifications() {
  const { session } = useAuth();
  const [latestNotification, setLatestNotification] = useState<Notification | null>(null);

  // Fetch notifications from API
  const { data: notifications = [], isLoading } = useQuery<Notification[]>({
    queryKey: ["/api/notifications"],
    enabled: !!session,
    refetchInterval: 30000, // Refetch every 30 seconds as fallback
    onError: (error) => {
      console.error("[useNotifications] Error fetching notifications:", error);
      console.error("[useNotifications] Error details:", {
        error,
        message: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
    },
  });

  // Fetch unread count
  const { data: unreadData } = useQuery<{ count: number }>({
    queryKey: ["/api/notifications/unread-count"],
    enabled: !!session,
    refetchInterval: 30000, // Refetch every 30 seconds as fallback
    onError: (error) => {
      console.error("[useNotifications] Error fetching unread count:", error);
      console.error("[useNotifications] Error details:", {
        error,
        message: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
    },
  });

  // Mark notification as read mutation
  const markAsReadMutation = useMutation({
    mutationFn: async (notificationId: string) => {
      return apiRequest("PATCH", `/api/notifications/${notificationId}/read`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
      queryClient.invalidateQueries({ queryKey: ["/api/notifications/unread-count"] });
    },
    onError: (error: any) => {
      console.error("Failed to mark notification as read:", error);
    },
  });

  // Mark all as read mutation
  const markAllAsReadMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("PATCH", "/api/notifications/read-all");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
      queryClient.invalidateQueries({ queryKey: ["/api/notifications/unread-count"] });
    },
    onError: (error: any) => {
      console.error("Failed to mark all notifications as read:", error);
    },
  });

  // Handle incoming WebSocket notification messages
  const handleWebSocketMessage = useCallback((message: any) => {
    try {
      if (message.type === "notification") {
        try {
          const notification = message.payload as Notification;
          setLatestNotification(notification);
          
          // Invalidate queries to refresh notification list and count
          try {
            queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
          } catch (error) {
            console.error("[useNotifications] Error invalidating notifications query:", error);
            console.error("[useNotifications] Error details:", {
              error,
              message: error instanceof Error ? error.message : String(error),
              stack: error instanceof Error ? error.stack : undefined,
            });
          }
          
          try {
            queryClient.invalidateQueries({ queryKey: ["/api/notifications/unread-count"] });
          } catch (error) {
            console.error("[useNotifications] Error invalidating unread count query:", error);
            console.error("[useNotifications] Error details:", {
              error,
              message: error instanceof Error ? error.message : String(error),
              stack: error instanceof Error ? error.stack : undefined,
            });
          }
        } catch (error) {
          console.error("[useNotifications] Error handling notification message:", error);
          console.error("[useNotifications] Error details:", {
            error,
            message: error instanceof Error ? error.message : String(error),
            stack: error instanceof Error ? error.stack : undefined,
            messageType: message.type,
            payload: message.payload,
          });
        }
      }
    } catch (error) {
      console.error("[useNotifications] Unexpected error in WebSocket message handler:", error);
      console.error("[useNotifications] Error details:", {
        error,
        message: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        messageType: message?.type,
        payload: message?.payload,
      });
    }
  }, []);

  // Set up WebSocket listener
  const { isConnected } = useWebSocket(handleWebSocketMessage);

  const markAsRead = useCallback((notificationId: string) => {
    markAsReadMutation.mutate(notificationId);
  }, [markAsReadMutation]);

  const markAllAsRead = useCallback(() => {
    markAllAsReadMutation.mutate();
  }, [markAllAsReadMutation]);

  const unreadCount = unreadData?.count || 0;

  return {
    notifications,
    unreadCount,
    isLoading,
    isConnected,
    latestNotification,
    markAsRead,
    markAllAsRead,
    isMarkingAsRead: markAsReadMutation.isPending,
  };
}
