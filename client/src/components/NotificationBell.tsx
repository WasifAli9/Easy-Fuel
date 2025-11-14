import {
  Bell,
  Package,
  Truck,
  Navigation,
  CheckCircle,
  DollarSign,
  PartyPopper,
  MessageCircle,
  CreditCard,
  AlertTriangle,
  Info,
  MapPin,
  Clock,
  AlertCircle,
  Ban,
  RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { useNotifications, type Notification } from "@/hooks/useNotifications";
import { formatDistanceToNow } from "date-fns";
import { useEffect, useState } from "react";
import { useToast } from "@/hooks/use-toast";
import type { LucideIcon } from "lucide-react";

function getNotificationIcon(type: string): LucideIcon {
  const iconMap: Record<string, LucideIcon> = {
    order_created: Package,
    order_awaiting_payment: CreditCard,
    order_paid: CheckCircle,
    driver_assigned: Truck,
    driver_en_route: Navigation,
    driver_arrived: MapPin,
    delivery_started: Truck,
    delivery_complete: CheckCircle,
    order_cancelled: Ban,
    order_refunded: RefreshCw,
    dispatch_offer_received: DollarSign,
    customer_accepted_offer: PartyPopper,
    customer_declined_offer: Ban,
    new_message: MessageCircle,
    payment_received: CreditCard,
    payment_failed: AlertCircle,
    system_alert: AlertTriangle,
    delivery_eta_update: Clock,
    account_approved: CheckCircle,
    account_rejected: Ban,
    account_suspended: AlertTriangle,
  };
  return iconMap[type] || Bell;
}

function getPriorityColor(type: string): string {
  const urgentTypes = [
    "driver_arrived",
    "dispatch_offer_received",
    "customer_accepted_offer",
    "account_suspended",
  ];
  const highTypes = [
    "driver_assigned",
    "driver_en_route",
    "payment_failed",
    "new_message",
  ];
  
  if (urgentTypes.includes(type)) return "text-red-600 dark:text-red-400";
  if (highTypes.includes(type)) return "text-orange-600 dark:text-orange-400";
  return "text-muted-foreground";
}

function NotificationItem({
  notification,
  onRead,
}: {
  notification: Notification;
  onRead: (id: string) => void;
}) {
  const IconComponent = getNotificationIcon(notification.type);
  const priorityColor = getPriorityColor(notification.type);
  const timeAgo = formatDistanceToNow(new Date(notification.createdAt), {
    addSuffix: true,
  });

  return (
    <div
      className={`p-3 hover-elevate active-elevate-2 cursor-pointer transition-colors rounded-md ${
        !notification.read ? "bg-accent/20" : ""
      }`}
      onClick={() => onRead(notification.id)}
      data-testid={`notification-item-${notification.id}`}
    >
      <div className="flex items-start gap-3">
        <div className={`mt-0.5 ${priorityColor}`}>
          <IconComponent className="h-5 w-5" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <p className={`text-sm font-medium ${priorityColor}`}>
              {notification.title}
            </p>
            {!notification.read && (
              <Badge variant="default" className="ml-2 h-2 w-2 p-0 rounded-full" data-testid={`unread-indicator-${notification.id}`} />
            )}
          </div>
          <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
            {notification.message}
          </p>
          <p className="text-xs text-muted-foreground mt-1">{timeAgo}</p>
        </div>
      </div>
    </div>
  );
}

export function NotificationBell() {
  const { notifications, unreadCount, markAsRead, markAllAsRead, latestNotification } = useNotifications();
  const [isOpen, setIsOpen] = useState(false);
  const { toast } = useToast();

  // Show toast for new notifications when not viewing the popover
  useEffect(() => {
    if (latestNotification && !isOpen) {
      toast({
        title: latestNotification.title,
        description: latestNotification.message,
        duration: 5000,
      });
    }
  }, [latestNotification, isOpen, toast]);

  const handleNotificationClick = (id: string) => {
    markAsRead(id);
  };

  const handleMarkAllAsRead = () => {
    markAllAsRead();
  };

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative"
          data-testid="button-notification-bell"
        >
          <Bell className="h-5 w-5" />
          {unreadCount > 0 && (
            <Badge
              variant="destructive"
              className="absolute -top-1 -right-1 h-5 w-5 flex items-center justify-center p-0 text-xs"
              data-testid="notification-count"
            >
              {unreadCount > 99 ? "99+" : unreadCount}
            </Badge>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-96 p-0" align="end" data-testid="notification-popover">
        <div className="flex items-center justify-between p-4 border-b">
          <h3 className="font-semibold text-base" data-testid="notification-header">
            Notifications
          </h3>
          {unreadCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleMarkAllAsRead}
              className="h-8 text-xs"
              data-testid="button-mark-all-read"
            >
              Mark all as read
            </Button>
          )}
        </div>
        <ScrollArea className="h-96">
          {notifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full p-8 text-center" data-testid="no-notifications">
              <Bell className="h-12 w-12 text-muted-foreground mb-4" />
              <p className="text-sm text-muted-foreground">No notifications yet</p>
            </div>
          ) : (
            <div className="flex flex-col">
              {notifications.map((notification, index) => (
                <div key={notification.id}>
                  <NotificationItem
                    notification={notification}
                    onRead={handleNotificationClick}
                  />
                  {index < notifications.length - 1 && <Separator />}
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
