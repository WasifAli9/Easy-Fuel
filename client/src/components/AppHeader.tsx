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
  const { data: notifications = [], refetch: refetchNotifications } = useQuery<any[]>({
    queryKey: ["/api/notifications"],
    enabled: !!profile, // Only fetch if user is logged in
    refetchInterval: 60000, // Refetch every 60 seconds (WebSocket handles real-time)
    staleTime: 0, // Always consider data stale to allow immediate refetch
  });

  // Fetch unread count
  const { data: unreadData, refetch: refetchUnreadCount } = useQuery<{ count: number }>({
    queryKey: ["/api/notifications/unread-count"],
    enabled: !!profile,
    refetchInterval: 60000, // Refetch every 60 seconds (WebSocket handles real-time)
  });

  const notificationCount = propNotificationCount ?? (unreadData?.count || 0);

  // Set up WebSocket for real-time notifications
  useWebSocket((message) => {
    if (message.type === "notification") {
      // New notification received via WebSocket
      queryClient.setQueryData<any[]>(["/api/notifications"], (old = []) => {
        // Check if notification already exists (avoid duplicates)
        const exists = old?.some((n: any) => n.id === message.payload?.id);
        if (exists) {
          return old;
        }
        // Add new notification to the beginning of the list
        return [message.payload, ...(old || [])];
      });
      
      // Update unread count
      refetchUnreadCount();
      
      // Show toast notification
      if (message.payload?.title) {
        toast({
          title: message.payload.title,
          description: message.payload.message,
          duration: 5000,
        });
      }
    } else if (message.type === "order_update") {
      // When order is updated (e.g., assigned), refresh notifications
      // This ensures we get the latest notification from the database
      if (message.payload?.state === "assigned" && profile?.role === "driver") {
        // Driver got assigned to an order - refresh notifications immediately
        refetchNotifications();
        refetchUnreadCount();
      } else {
        refetchNotifications();
        refetchUnreadCount();
      }
    } else if (message.type === "dispatch_offer") {
      // New dispatch offer - refresh notifications immediately
      // Immediately refetch to get the new notification from database
      // Use a small delay to ensure the notification is in the database
      setTimeout(() => {
        refetchNotifications();
        refetchUnreadCount();
      }, 500);
      
      // Also show a toast notification
      toast({
        title: "New Delivery Request",
        description: "You have a new fuel delivery request available",
        duration: 5000,
      });
    }
  });

  // Mark notification as read mutation
  const markAsReadMutation = useMutation({
    mutationFn: async (notificationId: string) => {
      const response = await apiRequest("PATCH", `/api/notifications/${notificationId}/read`);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
      queryClient.invalidateQueries({ queryKey: ["/api/notifications/unread-count"] });
    },
  });

  // Mark all as read mutation
  const markAllAsReadMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("PATCH", "/api/notifications/read-all");
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
      queryClient.invalidateQueries({ queryKey: ["/api/notifications/unread-count"] });
    },
  });

  async function handleSignOut() {
    await signOut();
    setLocation("/");
  }

  function handleNotificationClick(notification: any) {
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
                {notifications.map((notification) => (
                  <div
                    key={notification.id}
                    className={`p-4 border rounded-lg cursor-pointer transition-colors ${
                      !notification.read
                        ? "bg-primary/5 border-primary/20 hover:bg-primary/10"
                        : "hover:bg-muted/50"
                    }`}
                    onClick={() => handleNotificationClick(notification)}
                  >
                    <div className="flex items-start gap-3">
                      <div className="text-2xl flex-shrink-0">
                        {getNotificationIcon(notification.type)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <p className={`text-sm font-medium ${!notification.read ? "font-semibold" : ""}`}>
                            {notification.title}
                          </p>
                          {!notification.read && (
                            <div className="h-2 w-2 rounded-full bg-primary flex-shrink-0 mt-1.5" />
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                          {notification.message}
                        </p>
                        <p className="text-xs text-muted-foreground mt-2">
                          {formatDistanceToNow(new Date(notification.created_at), { addSuffix: true })}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </header>
  );
}
