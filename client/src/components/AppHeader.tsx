import { Logo } from "./Logo";
import { ThemeToggle } from "./ThemeToggle";
import { Button } from "@/components/ui/button";
import { Bell, User, Menu, LogOut, MapPin, UserCircle, Home, CreditCard, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetClose,
} from "@/components/ui/sheet";
import { useAuth } from "@/contexts/AuthContext";
import { useLocation, Link } from "wouter";
import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { formatDistanceToNow } from "date-fns";
import { Check, CheckCheck } from "lucide-react";
import { useWebSocket } from "@/hooks/useWebSocket";
import { useToast } from "@/hooks/use-toast";

interface AppHeaderProps {
  onMenuClick?: () => void;
  notificationCount?: number;
  showMenu?: boolean;
}

export function AppHeader({ onMenuClick, notificationCount: propNotificationCount, showMenu = true }: AppHeaderProps) {
  const { profile, signOut } = useAuth();
  const [, setLocation] = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  // Fetch notifications
  const { data: notifications = [], refetch: refetchNotifications, error: notificationsError } = useQuery<any[]>({
    queryKey: ["/api/notifications"],
    enabled: !!profile, // Only fetch if user is logged in
    refetchInterval: 60000, // Refetch every 60 seconds (WebSocket handles real-time)
    staleTime: 0, // Always consider data stale to allow immediate refetch
    onError: (error) => {
      console.error("[AppHeader] Error fetching notifications:", error);
      console.error("[AppHeader] Error details:", {
        error,
        message: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
    },
  });

  // Fetch unread count
  const { data: unreadData, refetch: refetchUnreadCount, error: unreadCountError } = useQuery<{ count: number }>({
    queryKey: ["/api/notifications/unread-count"],
    enabled: !!profile,
    refetchInterval: 60000, // Refetch every 60 seconds (WebSocket handles real-time)
    onError: (error) => {
      console.error("[AppHeader] Error fetching unread count:", error);
      console.error("[AppHeader] Error details:", {
        error,
        message: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
    },
  });

  const notificationCount = propNotificationCount ?? (unreadData?.count || 0);

  // Set up WebSocket for real-time notifications
  useWebSocket((message) => {
    try {
      if (message.type === "notification") {
        try {
          // New notification received via WebSocket
          queryClient.setQueryData<any[]>(["/api/notifications"], (old = []) => {
            try {
              // Check if notification already exists (avoid duplicates)
              const exists = old?.some((n: any) => n.id === message.payload?.id);
              if (exists) {
                return old;
              }
              // Add new notification to the beginning of the list
              return [message.payload, ...(old || [])];
            } catch (error) {
              console.error("[AppHeader] Error updating notifications query data:", error);
              console.error("[AppHeader] Error details:", {
                error,
                message: error instanceof Error ? error.message : String(error),
                stack: error instanceof Error ? error.stack : undefined,
                payload: message.payload,
                oldData: old,
              });
              // Return old data on error to prevent blank screen
              return old || [];
            }
          });
          
          // Update unread count
          refetchUnreadCount().catch((error) => {
            console.error("[AppHeader] Error refetching unread count:", error);
            console.error("[AppHeader] Error details:", {
              error,
              message: error instanceof Error ? error.message : String(error),
              stack: error instanceof Error ? error.stack : undefined,
            });
          });
          
          // Show toast notification
          if (message.payload?.title) {
            try {
              toast({
                title: message.payload.title,
                description: message.payload.message,
                duration: 5000,
              });
            } catch (error) {
              console.error("[AppHeader] Error showing toast notification:", error);
              console.error("[AppHeader] Error details:", {
                error,
                message: error instanceof Error ? error.message : String(error),
                stack: error instanceof Error ? error.stack : undefined,
                payload: message.payload,
              });
            }
          }
        } catch (error) {
          console.error("[AppHeader] Error handling notification message:", error);
          console.error("[AppHeader] Error details:", {
            error,
            message: error instanceof Error ? error.message : String(error),
            stack: error instanceof Error ? error.stack : undefined,
            messageType: message.type,
            payload: message.payload,
          });
        }
      } else if (message.type === "order_update") {
        try {
          // When order is updated (e.g., assigned), refresh notifications
          // This ensures we get the latest notification from the database
          if (message.payload?.state === "assigned" && profile?.role === "driver") {
            // Driver got assigned to an order - refresh notifications immediately
            refetchNotifications().catch((error) => {
              console.error("[AppHeader] Error refetching notifications (driver assigned):", error);
              console.error("[AppHeader] Error details:", {
                error,
                message: error instanceof Error ? error.message : String(error),
                stack: error instanceof Error ? error.stack : undefined,
              });
            });
            refetchUnreadCount().catch((error) => {
              console.error("[AppHeader] Error refetching unread count (driver assigned):", error);
              console.error("[AppHeader] Error details:", {
                error,
                message: error instanceof Error ? error.message : String(error),
                stack: error instanceof Error ? error.stack : undefined,
              });
            });
          } else {
            refetchNotifications().catch((error) => {
              console.error("[AppHeader] Error refetching notifications (order update):", error);
              console.error("[AppHeader] Error details:", {
                error,
                message: error instanceof Error ? error.message : String(error),
                stack: error instanceof Error ? error.stack : undefined,
              });
            });
            refetchUnreadCount().catch((error) => {
              console.error("[AppHeader] Error refetching unread count (order update):", error);
              console.error("[AppHeader] Error details:", {
                error,
                message: error instanceof Error ? error.message : String(error),
                stack: error instanceof Error ? error.stack : undefined,
              });
            });
          }
        } catch (error) {
          console.error("[AppHeader] Error handling order_update message:", error);
          console.error("[AppHeader] Error details:", {
            error,
            message: error instanceof Error ? error.message : String(error),
            stack: error instanceof Error ? error.stack : undefined,
            messageType: message.type,
            payload: message.payload,
          });
        }
      } else if (message.type === "dispatch_offer") {
        try {
          // New dispatch offer - refresh notifications immediately
          // Immediately refetch to get the new notification from database
          // Use a small delay to ensure the notification is in the database
          setTimeout(() => {
            refetchNotifications().catch((error) => {
              console.error("[AppHeader] Error refetching notifications (dispatch offer):", error);
              console.error("[AppHeader] Error details:", {
                error,
                message: error instanceof Error ? error.message : String(error),
                stack: error instanceof Error ? error.stack : undefined,
              });
            });
            refetchUnreadCount().catch((error) => {
              console.error("[AppHeader] Error refetching unread count (dispatch offer):", error);
              console.error("[AppHeader] Error details:", {
                error,
                message: error instanceof Error ? error.message : String(error),
                stack: error instanceof Error ? error.stack : undefined,
              });
            });
          }, 500);
          
          // Also show a toast notification
          try {
            toast({
              title: "New Delivery Request",
              description: "You have a new fuel delivery request available",
              duration: 5000,
            });
          } catch (error) {
            console.error("[AppHeader] Error showing dispatch offer toast:", error);
            console.error("[AppHeader] Error details:", {
              error,
              message: error instanceof Error ? error.message : String(error),
              stack: error instanceof Error ? error.stack : undefined,
            });
          }
        } catch (error) {
          console.error("[AppHeader] Error handling dispatch_offer message:", error);
          console.error("[AppHeader] Error details:", {
            error,
            message: error instanceof Error ? error.message : String(error),
            stack: error instanceof Error ? error.stack : undefined,
            messageType: message.type,
            payload: message.payload,
          });
        }
      }
    } catch (error) {
      console.error("[AppHeader] Unexpected error in WebSocket message handler:", error);
      console.error("[AppHeader] Error details:", {
        error,
        message: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        messageType: message?.type,
        payload: message?.payload,
      });
    }
  });

  // Mark notification as read mutation
  const markAsReadMutation = useMutation({
    mutationFn: async (notificationId: string) => {
      try {
        const response = await apiRequest("PATCH", `/api/notifications/${notificationId}/read`);
        return response.json();
      } catch (error) {
        console.error("[AppHeader] Error marking notification as read:", error);
        console.error("[AppHeader] Error details:", {
          error,
          message: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
          notificationId,
        });
        throw error;
      }
    },
    onSuccess: () => {
      try {
        queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
        queryClient.invalidateQueries({ queryKey: ["/api/notifications/unread-count"] });
      } catch (error) {
        console.error("[AppHeader] Error invalidating queries after mark as read:", error);
        console.error("[AppHeader] Error details:", {
          error,
          message: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
        });
      }
    },
    onError: (error) => {
      console.error("[AppHeader] Mutation error marking notification as read:", error);
      console.error("[AppHeader] Error details:", {
        error,
        message: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
    },
  });

  // Mark all as read mutation
  const markAllAsReadMutation = useMutation({
    mutationFn: async () => {
      try {
        const response = await apiRequest("PATCH", "/api/notifications/read-all");
        return response.json();
      } catch (error) {
        console.error("[AppHeader] Error marking all notifications as read:", error);
        console.error("[AppHeader] Error details:", {
          error,
          message: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
        });
        throw error;
      }
    },
    onSuccess: () => {
      try {
        queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
        queryClient.invalidateQueries({ queryKey: ["/api/notifications/unread-count"] });
      } catch (error) {
        console.error("[AppHeader] Error invalidating queries after mark all as read:", error);
        console.error("[AppHeader] Error details:", {
          error,
          message: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
        });
      }
    },
    onError: (error) => {
      console.error("[AppHeader] Mutation error marking all notifications as read:", error);
      console.error("[AppHeader] Error details:", {
        error,
        message: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
    },
  });

  async function handleSignOut() {
    await signOut();
    setLocation("/");
  }

  function handleNotificationClick(notification: any) {
    try {
      if (!notification.read) {
        markAsReadMutation.mutate(notification.id);
      }
      
      // Navigate based on notification type
      if (notification.data?.orderId) {
        if (profile?.role === "driver") {
          setLocation("/driver");
        } else if (profile?.role === "customer") {
          setLocation(`/customer/orders/${notification.data.orderId}`);
        }
        setNotificationsOpen(false);
      }
    } catch (error) {
      console.error("[AppHeader] Error handling notification click:", error);
      console.error("[AppHeader] Error details:", {
        error,
        message: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        notification,
      });
    }
  }

  function getNotificationIcon(type: string) {
    switch (type) {
      case "dispatch_offer_received":
        return "🎯";
      case "offer_accepted":
        return "✅";
      case "offer_declined":
        return "❌";
      case "driver_assigned":
        return "🚗";
      case "delivery_complete":
        return "🎉";
      case "new_message":
        return "💬";
      case "system_alert":
        return "ℹ️";
      default:
        return "🔔";
    }
  }

  return (
    <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="flex h-16 items-center justify-between px-4">
        <div className="flex items-center gap-4">
          {showMenu && (
            <Button 
              variant="ghost" 
              size="icon"
              onClick={() => {
                if (onMenuClick) {
                  onMenuClick();
                } else {
                  setMobileMenuOpen(true);
                }
              }}
              className="md:hidden"
              data-testid="button-menu"
            >
              <Menu className="h-5 w-5" />
            </Button>
          )}
          <Logo size="sm" />
          
          {/* Customer Navigation */}
          {profile?.role === "customer" && (
            <nav className="hidden md:flex items-center gap-2 ml-6">
              <Link href="/customer">
                <Button variant="ghost" size="sm" data-testid="nav-orders">
                  <Home className="h-4 w-4 mr-2" />
                  My Orders
                </Button>
              </Link>
              <Link href="/customer/addresses">
                <Button variant="ghost" size="sm" data-testid="nav-addresses">
                  <MapPin className="h-4 w-4 mr-2" />
                  Saved Addresses
                </Button>
              </Link>
              <Link href="/customer/payment-methods">
                <Button variant="ghost" size="sm" data-testid="nav-payment-methods">
                  <CreditCard className="h-4 w-4 mr-2" />
                  Payment Methods
                </Button>
              </Link>
            </nav>
          )}
        </div>
        
        <div className="flex items-center gap-2">
          <Button 
            variant="ghost" 
            size="icon"
            className="relative"
            onClick={() => setNotificationsOpen(true)}
            data-testid="button-notifications"
          >
            <Bell className="h-5 w-5" />
            {notificationCount > 0 && (
              <Badge 
                variant="destructive" 
                className="absolute -top-1 -right-1 h-5 w-5 flex items-center justify-center p-0 text-xs"
              >
                {notificationCount}
              </Badge>
            )}
          </Button>
          
          <ThemeToggle />
          
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button 
                variant="ghost" 
                size="icon"
                data-testid="button-profile"
              >
                <User className="h-5 w-5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>
                <div>
                  <p className="font-semibold">{profile?.fullName}</p>
                  <p className="text-xs text-muted-foreground capitalize">{profile?.role}</p>
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              {profile?.role === "customer" && (
                <>
                  <DropdownMenuItem onClick={() => setLocation("/customer/profile")} data-testid="menu-profile">
                    <UserCircle className="h-4 w-4 mr-2" />
                    My Profile
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setLocation("/customer/addresses")} data-testid="menu-addresses-mobile">
                    <MapPin className="h-4 w-4 mr-2" />
                    Saved Addresses
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setLocation("/customer/payment-methods")} data-testid="menu-payment-methods-mobile">
                    <CreditCard className="h-4 w-4 mr-2" />
                    Payment Methods
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                </>
              )}
              <DropdownMenuItem onClick={handleSignOut} data-testid="menu-signout">
                <LogOut className="h-4 w-4 mr-2" />
                Sign Out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Mobile Menu Sheet */}
      <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
        <SheetContent side="left" className="w-[300px] sm:w-[400px]">
          <SheetHeader>
            <SheetTitle>Menu</SheetTitle>
          </SheetHeader>
          <nav className="flex flex-col gap-4 mt-6">
            {profile?.role === "customer" && (
              <>
                <Link href="/customer">
                  <Button 
                    variant="ghost" 
                    className="w-full justify-start" 
                    onClick={() => setMobileMenuOpen(false)}
                    data-testid="mobile-nav-orders"
                  >
                    <Home className="h-4 w-4 mr-2" />
                    My Orders
                  </Button>
                </Link>
                <Link href="/customer/addresses">
                  <Button 
                    variant="ghost" 
                    className="w-full justify-start" 
                    onClick={() => setMobileMenuOpen(false)}
                    data-testid="mobile-nav-addresses"
                  >
                    <MapPin className="h-4 w-4 mr-2" />
                    Saved Addresses
                  </Button>
                </Link>
                <Link href="/customer/payment-methods">
                  <Button 
                    variant="ghost" 
                    className="w-full justify-start" 
                    onClick={() => setMobileMenuOpen(false)}
                    data-testid="mobile-nav-payment-methods"
                  >
                    <CreditCard className="h-4 w-4 mr-2" />
                    Payment Methods
                  </Button>
                </Link>
                <Link href="/customer/profile">
                  <Button 
                    variant="ghost" 
                    className="w-full justify-start" 
                    onClick={() => setMobileMenuOpen(false)}
                    data-testid="mobile-nav-profile"
                  >
                    <UserCircle className="h-4 w-4 mr-2" />
                    My Profile
                  </Button>
                </Link>
              </>
            )}
          </nav>
        </SheetContent>
      </Sheet>

      {/* Notifications Sheet */}
      <Sheet open={notificationsOpen} onOpenChange={setNotificationsOpen}>
        <SheetContent side="right" className="w-[300px] sm:w-[400px] flex flex-col">
          <SheetHeader>
            <div className="flex items-center justify-between">
              <SheetTitle>Notifications</SheetTitle>
              {notificationCount > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => markAllAsReadMutation.mutate()}
                  disabled={markAllAsReadMutation.isPending}
                  className="text-xs"
                >
                  <CheckCheck className="h-3 w-3 mr-1" />
                  Mark all read
                </Button>
              )}
            </div>
          </SheetHeader>
          <div className="mt-6 flex-1 overflow-y-auto">
            {notifications.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Bell className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>No notifications</p>
              </div>
            ) : (
              <div className="space-y-2">
                {notifications
                  .filter((notification) => notification && notification.id) // Filter out invalid notifications
                  .map((notification) => {
                    try {
                      const notificationId = notification.id || `unknown-${Math.random()}`;
                      const notificationType = notification.type || "unknown";
                      const notificationTitle = notification.title || "Notification";
                      const notificationMessage = notification.message || "";
                      const createdAt = notification.created_at || notification.createdAt || new Date().toISOString();
                      
                      let timeAgo = "Just now";
                      try {
                        timeAgo = formatDistanceToNow(new Date(createdAt), { addSuffix: true });
                      } catch (error) {
                        console.error("[AppHeader] Error formatting notification date:", error);
                        console.error("[AppHeader] Error details:", {
                          error,
                          createdAt,
                          notificationId,
                        });
                      }
                      
                      return (
                        <div
                          key={notificationId}
                          className={`p-4 border rounded-lg cursor-pointer transition-colors ${
                            !notification.read
                              ? "bg-primary/5 border-primary/20 hover:bg-primary/10"
                              : "hover:bg-muted/50"
                          }`}
                          onClick={() => handleNotificationClick(notification)}
                        >
                          <div className="flex items-start gap-3">
                            <div className="text-2xl flex-shrink-0">
                              {getNotificationIcon(notificationType)}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-start justify-between gap-2">
                                <p className={`text-sm font-medium ${!notification.read ? "font-semibold" : ""}`}>
                                  {notificationTitle}
                                </p>
                                {!notification.read && (
                                  <div className="h-2 w-2 rounded-full bg-primary flex-shrink-0 mt-1.5" />
                                )}
                              </div>
                              <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                                {notificationMessage}
                              </p>
                              <p className="text-xs text-muted-foreground mt-2">
                                {timeAgo}
                              </p>
                            </div>
                          </div>
                        </div>
                      );
                    } catch (error) {
                      console.error("[AppHeader] Error rendering notification:", error);
                      console.error("[AppHeader] Error details:", {
                        error,
                        message: error instanceof Error ? error.message : String(error),
                        stack: error instanceof Error ? error.stack : undefined,
                        notification,
                      });
                      return null; // Don't render invalid notifications
                    }
                  })
                  .filter(Boolean) // Remove null entries
                }
              </div>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </header>
  );
}
