import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import {
  Bell,
  MessageCircle,
  CreditCard,
  FileSignature,
  Package,
  Truck,
  Warehouse,
  CheckCircle,
  AlertTriangle,
  Ban,
  Navigation,
  MapPin,
  Clock,
  PartyPopper,
  RefreshCw,
  Info,
  Shield,
  Car,
  type LucideIcon,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { useNotifications, type Notification } from "@/hooks/useNotifications";
import { useAuth } from "@/contexts/AuthContext";
import { formatDepotOrderStatus } from "@/lib/utils";
import { cn } from "@/lib/utils";
import { isDriverActionRequiredState } from "@shared/driver-job-states";
import { normalizeDocuments } from "@/lib/document-normalize";
import { useLocation } from "wouter";

type DriverTab =
  | "overview"
  | "assigned"
  | "vehicles"
  | "pricing"
  | "settings"
  | "history"
  | "depot-orders"
  | "available-depots";

type AlertAction = {
  id: string;
  priority: "urgent" | "high" | "medium";
  title: string;
  description: string;
  cta: string;
  tab?: DriverTab;
  href?: string;
  icon: LucideIcon;
};

type DriverAlertsPanelProps = {
  onNavigate: (tab: DriverTab) => void;
  className?: string;
};

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
    dispatch_offer_received: PartyPopper,
    customer_accepted_offer: PartyPopper,
    customer_declined_offer: Ban,
    new_message: MessageCircle,
    payment_received: CreditCard,
    driver_depot_order_placed: Warehouse,
    driver_depot_order_confirmed: Warehouse,
    driver_depot_order_fulfilled: Package,
    driver_depot_order_cancelled: Ban,
    driver_depot_order_accepted: CheckCircle,
    driver_depot_order_rejected: Ban,
    driver_depot_payment_verified: CreditCard,
    driver_depot_payment_rejected: AlertTriangle,
    driver_depot_order_released: FileSignature,
    driver_depot_order_completed: CheckCircle,
    payment_failed: AlertTriangle,
    system_alert: AlertTriangle,
    delivery_eta_update: Clock,
    account_approved: CheckCircle,
    account_rejected: Ban,
    account_suspended: AlertTriangle,
  };
  return iconMap[type] || Bell;
}

function isDepotNotification(type: string) {
  return type.startsWith("driver_depot_");
}

function isUrgentNotification(type: string) {
  return [
    "driver_depot_order_released",
    "driver_depot_payment_rejected",
    "driver_depot_payment_verified",
    "dispatch_offer_received",
    "new_message",
    "payment_failed",
    "account_suspended",
  ].includes(type);
}

function depotOrderStatus(order: any): string {
  return order.status ?? order.orderStatus ?? order.order_status ?? "";
}

function depotNeedsPayment(order: any): boolean {
  const status = depotOrderStatus(order);
  const paymentStatus = order.payment_status ?? order.paymentStatus;
  return (
    status === "pending_payment" &&
    (paymentStatus === "pending_payment" || paymentStatus === "payment_failed" || !paymentStatus)
  );
}

function depotNeedsSignature(order: any): boolean {
  const status = depotOrderStatus(order);
  const deliverySig = order.delivery_signature_url ?? order.deliverySignatureUrl;
  return (status === "awaiting_signature" || status === "released") && !deliverySig;
}

function depotReadyForPickup(order: any): boolean {
  return depotOrderStatus(order) === "ready_for_pickup";
}

function tabForNotification(notification: Notification): DriverTab {
  const data = notification.data ?? {};
  const action = String(data.action ?? "");
  if (action === "open_chat" || action === "open_order" || notification.type === "new_message") {
    return "assigned";
  }
  if (
    action === "open_depot_order" ||
    isDepotNotification(notification.type) ||
    data.depotOrderId ||
    data.depot_order_id
  ) {
    return "depot-orders";
  }
  return "overview";
}

export function DriverAlertsPanel({ onNavigate, className }: DriverAlertsPanelProps) {
  const { session, profile, loading } = useAuth();
  const [, setLocation] = useLocation();
  const { notifications, unreadCount, markAsRead, markAllAsRead, isLoading } = useNotifications();

  const { data: depotOrders = [] } = useQuery<any[]>({
    queryKey: ["/api/driver/depot-orders"],
    enabled: !loading && !!session?.access_token && profile?.role === "driver",
    refetchInterval: 15_000,
    staleTime: 10_000,
    retry: false,
  });

  const { data: customerOrders = [] } = useQuery<any[]>({
    queryKey: ["/api/driver/assigned-orders"],
    enabled: !loading && !!session?.access_token && profile?.role === "driver",
    refetchInterval: 15_000,
    staleTime: 10_000,
    retry: false,
  });

  const { data: documentsData = [] } = useQuery<any[]>({
    queryKey: ["/api/driver/documents"],
    enabled: !loading && !!session?.access_token && profile?.role === "driver",
    staleTime: 15_000,
    retry: false,
  });

  const { data: vehicles = [] } = useQuery<any[]>({
    queryKey: ["/api/driver/vehicles"],
    enabled: !loading && !!session?.access_token && profile?.role === "driver",
    staleTime: 15_000,
    retry: false,
  });

  const actionItems = useMemo<AlertAction[]>(() => {
    const items: AlertAction[] = [];
    const now = new Date();
    const in7Days = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    const in30Days = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

    for (const order of customerOrders) {
      if (!isDriverActionRequiredState(order.state)) continue;

      const shortId = String(order.id ?? "").slice(-8);
      const customerName =
        order.customers?.profiles?.full_name ||
        order.customers?.company_name ||
        order.customer_name ||
        "Customer";
      const fuelLabel = order.fuel_types?.label || "Fuel";
      const litres = order.litres ?? 0;
      const action =
        order.state === "assigned"
          ? { title: "Delivery ready to start", cta: "Start delivery", icon: Truck }
          : order.state === "en_route"
            ? { title: "Fuel pickup required", cta: "Mark picked up", icon: Package }
            : { title: "Delivery completion required", cta: "Complete delivery", icon: CheckCircle };

      items.push({
        id: `customer-order-${order.id}`,
        priority: order.state === "picked_up" ? "urgent" : "high",
        title: action.title,
        description: `Customer order #${shortId} · ${customerName} · ${fuelLabel} ${litres}L`,
        cta: action.cta,
        tab: "assigned",
        icon: action.icon,
      });
    }

    for (const order of depotOrders) {
      const depotName = order.depots?.name || "Depot";
      const fuelLabel = order.fuel_types?.label || "Fuel";
      const litres = order.litres ?? 0;
      const statusLabel = formatDepotOrderStatus({
        status: depotOrderStatus(order),
        payment_status: order.payment_status ?? order.paymentStatus,
        payment_method: order.payment_method ?? order.paymentMethod,
      });

      if (depotNeedsSignature(order)) {
        items.push({
          id: `depot-sign-${order.id}`,
          priority: "urgent",
          title: "Signature required",
          description: `${depotName} · ${fuelLabel} ${litres}L — sign to confirm receipt`,
          cta: "Sign receipt",
          tab: "depot-orders",
          icon: FileSignature,
        });
      } else if (depotNeedsPayment(order)) {
        const failed = (order.payment_status ?? order.paymentStatus) === "payment_failed";
        items.push({
          id: `depot-pay-${order.id}`,
          priority: "urgent",
          title: failed ? "Payment rejected — pay again" : "Payment required",
          description: `${depotName} · ${fuelLabel} ${litres}L · ${statusLabel}`,
          cta: failed ? "Pay again" : "Pay now",
          tab: "depot-orders",
          icon: CreditCard,
        });
      } else if (depotReadyForPickup(order)) {
        items.push({
          id: `depot-pickup-${order.id}`,
          priority: "high",
          title: "Ready for pickup",
          description: `${depotName} · ${fuelLabel} ${litres}L is ready at the depot`,
          cta: "View order",
          tab: "depot-orders",
          icon: Package,
        });
      }
    }

    for (const document of normalizeDocuments(documentsData)) {
      const expiry = document.expiry_date ? new Date(document.expiry_date) : null;
      const status = document.verification_status;
      const rejected = status === "rejected";
      const expired = Boolean(expiry && expiry < now);
      const expiringSoon = Boolean(expiry && expiry >= now && expiry <= in7Days);
      const pending = status === "pending" || status === "pending_review";
      if (!rejected && !expired && !expiringSoon && !pending) continue;

      const label = (document.title || document.doc_type || "Compliance document")
        .replace(/_/g, " ")
        .replace(/\b\w/g, (character: string) => character.toUpperCase());
      const title = rejected
        ? "Document rejected"
        : expired
          ? "Document expired"
          : expiringSoon
            ? "Document expires soon"
            : "Document awaiting review";
      const detail = expiry
        ? `${label} · ${expired ? "expired" : "expires"} ${expiry.toLocaleDateString()}`
        : `${label} · submitted for review`;

      items.push({
        id: `document-${document.id}`,
        priority: rejected || expired ? "urgent" : expiringSoon ? "high" : "medium",
        title,
        description: detail,
        cta: rejected || expired || expiringSoon ? "Update document" : "View status",
        href: "/driver/profile",
        icon: Shield,
      });
    }

    const vehicleExpiryFields = [
      { snake: "license_disk_expiry", camel: "licenseDiskExpiry", label: "License disk" },
      { snake: "roadworthy_expiry", camel: "roadworthyExpiry", label: "Roadworthy certificate" },
      { snake: "insurance_expiry", camel: "insuranceExpiry", label: "Insurance" },
    ] as const;

    for (const vehicle of vehicles) {
      const vehicleLabel =
        vehicle.registrationNumber ||
        vehicle.registration_number ||
        [vehicle.make, vehicle.model].filter(Boolean).join(" ") ||
        "Vehicle";

      for (const field of vehicleExpiryFields) {
        const rawExpiry = vehicle[field.snake] ?? vehicle[field.camel];
        if (!rawExpiry) continue;
        const expiry = new Date(rawExpiry);
        const expired = expiry < now;
        const expiringSoon = expiry >= now && expiry <= in30Days;
        if (!expired && !expiringSoon) continue;

        items.push({
          id: `vehicle-${vehicle.id}-${field.snake}`,
          priority: expired || expiry <= in7Days ? "urgent" : "high",
          title: expired ? `${field.label} expired` : `${field.label} renewal due`,
          description: `${vehicleLabel} · ${expired ? "expired" : "expires"} ${expiry.toLocaleDateString()}`,
          cta: "Manage vehicle",
          tab: "vehicles",
          icon: Car,
        });
      }
    }

    return items;
  }, [customerOrders, depotOrders, documentsData, vehicles]);

  const messageNotifications = useMemo(() => {
    const unread = notifications.filter((n) => !n.read);
    const sorted = [...unread].sort((a, b) => {
      const aUrgent = isUrgentNotification(a.type) || isDepotNotification(a.type) ? 1 : 0;
      const bUrgent = isUrgentNotification(b.type) || isDepotNotification(b.type) ? 1 : 0;
      if (aUrgent !== bUrgent) return bUrgent - aUrgent;
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
    return sorted.slice(0, 8);
  }, [notifications]);

  const totalCount = actionItems.length + unreadCount;
  if (!isLoading && totalCount === 0) {
    return null;
  }

  return (
    <Card
      className={cn(
        "rounded-xl border-primary/25 bg-gradient-to-br from-primary/[0.07] via-card to-card shadow-lg shadow-primary/[0.06] overflow-hidden",
        className,
      )}
      data-testid="driver-alerts-panel"
    >
      <CardHeader className="px-4 pt-4 pb-2 sm:px-5 sm:pt-5">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-0.5">
            <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
              <span className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-primary/15 text-primary">
                <Bell className="h-4 w-4" />
              </span>
              Messages & depot actions
              {totalCount > 0 && (
                <Badge variant="destructive" className="rounded-full px-2">
                  {totalCount > 99 ? "99+" : totalCount}
                </Badge>
              )}
            </CardTitle>
            <CardDescription className="text-xs sm:text-sm">
              Customer deliveries, depot orders, and unread notifications that need your attention.
            </CardDescription>
          </div>
          {unreadCount > 0 && (
            <Button
              variant="outline"
              size="sm"
              className="rounded-full shrink-0"
              onClick={() => markAllAsRead()}
              data-testid="driver-alerts-mark-all-read"
            >
              Mark all read
            </Button>
          )}
        </div>
      </CardHeader>

      <CardContent className="space-y-3 px-4 pb-4 pt-0 sm:px-5 sm:pb-5">
        {actionItems.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wider text-amber-700 dark:text-amber-400 flex items-center gap-1.5">
              <AlertTriangle className="h-3.5 w-3.5" />
              Actions required ({actionItems.length})
            </p>
            <ScrollArea className={actionItems.length > 4 ? "h-[240px] pr-3" : undefined}>
            <ul className="space-y-2">
              {actionItems.map((item) => {
                const Icon = item.icon;
                return (
                  <li
                    key={item.id}
                    className={cn(
                      "flex flex-col gap-2.5 rounded-lg border p-2.5 sm:flex-row sm:items-center",
                      item.priority === "urgent"
                        ? "border-destructive/40 bg-destructive/10"
                        : "border-amber-500/30 bg-amber-500/10",
                    )}
                  >
                    <div className="flex min-w-0 flex-1 items-start gap-2.5">
                      <div
                        className={cn(
                          "mt-0.5 rounded-md p-1.5 shrink-0",
                          item.priority === "urgent"
                            ? "bg-destructive/15 text-destructive"
                            : "bg-amber-500/15 text-amber-700 dark:text-amber-400",
                        )}
                      >
                        <Icon className="h-4 w-4" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold">{item.title}</p>
                        <p className="mt-0.5 text-xs text-muted-foreground sm:text-sm">{item.description}</p>
                      </div>
                    </div>
                    <Button
                      size="sm"
                      variant={item.priority === "urgent" ? "destructive" : "default"}
                      className="shrink-0 self-start sm:self-center"
                      onClick={() => {
                        if (item.href) {
                          setLocation(item.href);
                        } else if (item.tab) {
                          onNavigate(item.tab);
                        }
                      }}
                    >
                      {item.cta}
                    </Button>
                  </li>
                );
              })}
            </ul>
            </ScrollArea>
          </div>
        )}

        {actionItems.length > 0 && messageNotifications.length > 0 && <Separator />}

        {messageNotifications.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wider text-primary flex items-center gap-1.5">
              <MessageCircle className="h-3.5 w-3.5" />
              Unread messages ({unreadCount})
            </p>
            <ScrollArea className={messageNotifications.length > 4 ? "h-[190px] pr-3" : undefined}>
              <ul className="space-y-1.5">
                {messageNotifications.map((notification) => {
                  const Icon = getNotificationIcon(notification.type);
                  const urgent = isUrgentNotification(notification.type);
                  const depot = isDepotNotification(notification.type);
                  const timeAgo = formatDistanceToNow(new Date(notification.createdAt), {
                    addSuffix: true,
                  });
                  return (
                    <li key={notification.id}>
                      <button
                        type="button"
                        className={cn(
                          "flex w-full items-start gap-2.5 rounded-lg border p-2.5 text-left transition-colors hover:bg-accent/40",
                          urgent || depot
                            ? "border-primary/30 bg-primary/[0.06]"
                            : "border-border/60 bg-background/60",
                        )}
                        onClick={() => {
                          markAsRead(notification.id);
                          onNavigate(tabForNotification(notification));
                        }}
                        data-testid={`driver-alert-notification-${notification.id}`}
                      >
                        <div
                          className={cn(
                            "mt-0.5 rounded-md p-1.5 shrink-0",
                            urgent
                              ? "bg-destructive/15 text-destructive"
                              : depot
                                ? "bg-primary/15 text-primary"
                                : "bg-muted text-muted-foreground",
                          )}
                        >
                          <Icon className="h-4 w-4" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-2">
                            <p className="text-sm font-semibold truncate">{notification.title}</p>
                            <span className="text-[11px] text-muted-foreground whitespace-nowrap shrink-0">
                              {timeAgo}
                            </span>
                          </div>
                          <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground sm:text-sm">
                            {notification.message}
                          </p>
                          {(depot || notification.type === "new_message") && (
                            <p className="mt-1 flex items-center gap-1 text-xs font-medium text-primary">
                              <Info className="h-3 w-3" />
                              Tap to open
                            </p>
                          )}
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </ScrollArea>
          </div>
        )}

        {isLoading && totalCount === 0 && (
          <p className="text-sm text-muted-foreground py-2">Loading alerts…</p>
        )}
      </CardContent>
    </Card>
  );
}
