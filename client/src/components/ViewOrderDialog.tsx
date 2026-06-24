import { useState, useEffect, useMemo } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MapPin, Calendar, Package, Loader2, CheckCircle2, XCircle, CreditCard, MessageCircle, Navigation } from "lucide-react";
import { StatusBadge } from "./StatusBadge";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { DriverLocationMap } from "./DriverLocationMap";
import { OrderChat } from "./OrderChat";
import { useCurrency } from "@/hooks/use-currency";
import { cn, formatCurrency, normalizeProfilePhotoUrl } from "@/lib/utils";
import { useWebSocket } from "@/hooks/useWebSocket";
import { DeliverySignatureProof } from "@/components/DeliverySignatureProof";
import { canShowOrderTrackingMap } from "@/lib/order-tracking";

const orderEditSchema = z.object({
  fuelTypeId: z.string().min(1, "Please select a fuel type"),
  litres: z.string().min(1, "Litres is required").refine((val) => !isNaN(Number(val)) && Number(val) > 0, {
    message: "Litres must be a positive number",
  }),
  dropLat: z.string().min(1, "Latitude is required").refine((val) => !isNaN(Number(val)), {
    message: "Latitude must be a number",
  }),
  dropLng: z.string().min(1, "Longitude is required").refine((val) => !isNaN(Number(val)), {
    message: "Longitude must be a number",
  }),
  timeWindow: z.string().optional(),
});

type OrderEditValues = z.infer<typeof orderEditSchema>;

interface ViewOrderDialogProps {
  orderId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ViewOrderDialog({ orderId, open, onOpenChange }: ViewOrderDialogProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [activeTab, setActiveTab] = useState("details");
  const { toast } = useToast();
  const { currencySymbol, currency } = useCurrency();

  // Fetch order details
  const { data: order, isLoading: loadingOrder } = useQuery<any>({
    queryKey: ["/api/orders", orderId],
    enabled: open && !!orderId,
    refetchInterval: 30000, // Poll every 30 seconds (WebSocket handles real-time updates)
    staleTime: 15 * 1000, // Consider data fresh for 15 seconds
  });

  const { data: driverQuotes = [], isLoading: loadingQuotes } = useQuery<any[]>({
    queryKey: ["/api/orders", orderId, "offers"],
    enabled: open && !!orderId,
    refetchInterval: 30000, // Poll every 30 seconds (WebSocket handles real-time updates)
    staleTime: 15 * 1000, // Consider data fresh for 15 seconds
  });

  // Listen for real-time order updates via WebSocket
  useWebSocket((message) => {
    const messageType = message.type;
    const msgOrderId = message.orderId || message.payload?.orderId;
    const orderData = message.order || message.payload?.order;
    
    if (msgOrderId === orderId && messageType === "order_updated" && orderData) {
      // Directly update the query cache with new order data (like chat messages)
      queryClient.setQueryData(["/api/orders", orderId], orderData);
      
      // Also update the orders list
      queryClient.setQueryData<any[]>(["/api/orders"], (old = []) => {
        const exists = old.findIndex((o: any) => o.id === orderId);
        if (exists >= 0) {
          const updated = [...old];
          updated[exists] = orderData;
          return updated;
        }
        return old;
      });
    }

    if (
      msgOrderId === orderId &&
      (messageType === "driver_offers_available" ||
        messageType === "driver_offer_received" ||
        messageType === "driver_offer_pricing_updated")
    ) {
      queryClient.invalidateQueries({ queryKey: ["/api/orders", orderId, "offers"] });
    }
  });

  // Get accepted or pending quote for pricing calculation
  const activeQuote = driverQuotes.find(
    (q: any) => q.state === "customer_accepted" || q.state === "pending_customer"
  ) || (order?.assigned_driver_id && driverQuotes.find((q: any) => q.driver?.id === order.assigned_driver_id));

  // Calculate distance from depot to drop location
  const calculateDistanceKm = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
    const R = 6371; // Earth's radius in kilometers
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLon = ((lon2 - lon1) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos((lat1 * Math.PI) / 180) *
        Math.cos((lat2 * Math.PI) / 180) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return Math.round(R * c * 10) / 10;
  };

  // Calculate pricing breakdown
  const pricingBreakdown = useMemo(() => {
    if (!order) {
      return {
        fuelCost: 0,
        deliveryFee: 0,
        serviceFee: 0,
        total: 0,
      };
    }

    // If we have an active quote with estimated pricing, use that
    if (activeQuote?.estimatedPricing) {
      return {
        fuelCost: activeQuote.estimatedPricing.fuelCost,
        deliveryFee: activeQuote.estimatedPricing.deliveryFee,
        serviceFee: 0,
        total: activeQuote.estimatedPricing.total,
      };
    }

    // If order is already accepted, use stored values
    const litres = parseFloat(order.litres || 0);
    const fuelPricePerLiterCents = order.fuel_price_cents || 0;
    const fuelCost = (fuelPricePerLiterCents / 100) * litres;
    const deliveryFee = (order.delivery_fee_cents || 0) / 100;
    const serviceFee = 0;
    const total = fuelCost + deliveryFee + serviceFee;

    return {
      fuelCost,
      deliveryFee,
      serviceFee,
      total,
    };
  }, [order, activeQuote]);

  // Fetch fuel types for editing
  const { data: fuelTypes = [], isLoading: loadingFuelTypes } = useQuery<any[]>({
    queryKey: ["/api/fuel-types"],
    enabled: isEditing,
  });

  const form = useForm<OrderEditValues>({
    resolver: zodResolver(orderEditSchema),
    defaultValues: {
      fuelTypeId: "",
      litres: "",
      dropLat: "",
      dropLng: "",
      timeWindow: "",
    },
  });

  // Update form when order data changes
  useEffect(() => {
    if (!open) {
      setActiveTab("details");
      setIsEditing(false);
    }
  }, [open]);

  useEffect(() => {
    if (order) {
      form.reset({
        fuelTypeId: order.fuel_type_id || "",
        litres: order.litres || "",
        dropLat: order.drop_lat?.toString() || "",
        dropLng: order.drop_lng?.toString() || "",
        timeWindow: order.time_window || "",
      });
    }
  }, [order, form]);

  const updateOrderMutation = useMutation<any, any, OrderEditValues>({
    mutationFn: async (values: OrderEditValues) => {
      const response = await apiRequest("PATCH", `/api/orders/${orderId}`, {
        fuelTypeId: values.fuelTypeId,
        litres: values.litres,
        dropLat: parseFloat(values.dropLat),
        dropLng: parseFloat(values.dropLng),
        timeWindow: values.timeWindow || null,
      });
      return response.json();
    },
    onSuccess: async () => {
      // Invalidate all related queries
      await queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
      await queryClient.invalidateQueries({ queryKey: ["/api/orders", orderId] });
      await queryClient.invalidateQueries({ queryKey: ["/api/orders", orderId, "offers"] });
      await queryClient.invalidateQueries({ queryKey: ["/api/driver/offers"] });
      // Immediately refetch to show updated state
      await queryClient.refetchQueries({ queryKey: ["/api/orders", orderId] });
      await queryClient.refetchQueries({ queryKey: ["/api/orders"] });
      toast({
        title: "Order updated",
        description: "Your order has been updated successfully",
      });
      setIsEditing(false);
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update order",
        variant: "destructive",
      });
    },
  });

  const cancelOrderMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("DELETE", `/api/orders/${orderId}`);
      return response.json();
    },
    onSuccess: async () => {
      // Invalidate all related queries
      await queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
      await queryClient.invalidateQueries({ queryKey: ["/api/orders", orderId] });
      await queryClient.invalidateQueries({ queryKey: ["/api/orders", orderId, "offers"] });
      await queryClient.invalidateQueries({ queryKey: ["/api/driver/offers"] });
      // Immediately refetch to show updated state
      await queryClient.refetchQueries({ queryKey: ["/api/orders"] });
      toast({
        title: "Order cancelled",
        description: "Your order has been cancelled successfully",
      });
      onOpenChange(false);
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to cancel order",
        variant: "destructive",
      });
    },
  });

  const acceptDriverOfferMutation = useMutation({
    mutationFn: async (driverOfferId: string) => {
      const response = await apiRequest("POST", `/api/orders/${orderId}/offers/${driverOfferId}/accept`);
      return response.json();
    },
    onSuccess: async () => {
      // Invalidate all related queries
      await queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
      await queryClient.invalidateQueries({ queryKey: ["/api/orders", orderId] });
      await queryClient.invalidateQueries({ queryKey: ["/api/orders", orderId, "offers"] });
      await queryClient.invalidateQueries({ queryKey: ["/api/chat/thread", orderId] });
      await queryClient.invalidateQueries({ queryKey: ["/api/driver/offers"] });
      await queryClient.invalidateQueries({ queryKey: ["/api/driver/assigned-orders"] });
      // Immediately refetch to show updated state
      await queryClient.refetchQueries({ queryKey: ["/api/orders", orderId] });
      await queryClient.refetchQueries({ queryKey: ["/api/orders", orderId, "offers"] });
      await queryClient.refetchQueries({ queryKey: ["/api/orders"] });
      toast({
        title: "Driver assigned",
        description: "You accepted the driver's quote. They have been notified.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to accept driver quote",
        variant: "destructive",
      });
    },
  });

  const payOrderMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", `/api/orders/${orderId}/pay`);
      return response.json() as Promise<{ paymentUrl: string }>;
    },
    onSuccess: (data) => {
      if (data.paymentUrl) {
        window.location.href = data.paymentUrl;
      }
    },
    onError: (error: any) => {
      toast({
        title: "Payment failed",
        description: error.message || "Could not start payment",
        variant: "destructive",
      });
    },
  });

  const onSubmit = (values: OrderEditValues) => {
    updateOrderMutation.mutate(values);
  };

  const handleCancel = () => {
    if (confirm("Are you sure you want to cancel this order?")) {
      cancelOrderMutation.mutate();
    }
  };

  const handleAcceptDriverQuote = (driverOfferId: string) => {
    acceptDriverOfferMutation.mutate(driverOfferId);
  };

  if (loadingOrder) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="flex max-h-[min(92dvh,92vh)] w-[calc(100%-1.5rem)] flex-col overflow-hidden p-0" data-testid="dialog-view-order">
          <DialogHeader>
            <DialogTitle>Order Details</DialogTitle>
            <DialogDescription>Loading order details...</DialogDescription>
          </DialogHeader>
          <div className="flex items-center justify-center py-8">
            <p className="text-muted-foreground">Loading order details...</p>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  if (!order) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="flex max-h-[min(92dvh,92vh)] w-[calc(100%-1.5rem)] flex-col overflow-hidden p-0" data-testid="dialog-view-order">
          <DialogHeader>
            <DialogTitle>Order Details</DialogTitle>
            <DialogDescription>Order not found</DialogDescription>
          </DialogHeader>
        </DialogContent>
      </Dialog>
    );
  }

  const canEdit = order.state === "created";
  const canCancel = !["delivered", "cancelled", "picked_up", "en_route", "paid", "awaiting_payment"].includes(order.state);
  const canPay =
    order.state === "awaiting_payment" && !order.paid_at && !order.paidAt;
  const chatClosed = ["delivered", "cancelled", "refunded", "paid"].includes(order.state);
  const canShowChat = !!order.assigned_driver_id && order.chat_enabled !== false;
  const chatReadOnly = chatClosed;
  const showTrackingMap = canShowOrderTrackingMap(order);
  const isSplitTab = activeTab === "tracking" || activeTab === "chat";

  const orderSummarySidebar = (
    <>
      <div className="rounded-xl border border-border/70 bg-gradient-to-br from-muted/50 to-muted/20 p-3 space-y-2.5">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-background/80 border border-border/60">
            <Package className="h-4 w-4 text-primary" />
          </div>
          <div className="min-w-0">
            <p className="font-semibold truncate" data-testid="text-fuel-type">
              {order.fuel_types?.label || "Unknown"}
            </p>
            <p className="text-sm text-muted-foreground" data-testid="text-litres">
              {order.litres}L
            </p>
          </div>
        </div>

        <div className="flex items-start gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-background/80 border border-border/60 shrink-0">
            <MapPin className="h-4 w-4 text-primary" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-medium">Delivery Location</p>
            <p className="text-sm text-muted-foreground break-all" data-testid="text-coordinates">
              {order.drop_lat}, {order.drop_lng}
            </p>
          </div>
        </div>
      </div>

      {order.assigned_driver_id && order.driver_details ? (
        <div className="rounded-xl border border-primary/25 bg-primary/[0.06] p-3">
          <Badge variant="default" className="bg-primary text-xs mb-2.5">
            Driver Assigned
          </Badge>
          <div className="flex items-center gap-3">
            <Avatar className="h-10 w-10 shrink-0">
              <AvatarImage
                src={normalizeProfilePhotoUrl(order.driver_details.profile_photo_url) || undefined}
                onError={() => {}}
                alt={order.driver_details.full_name || "Driver"}
              />
              <AvatarFallback className="bg-primary text-primary-foreground text-xs">
                {(order.driver_details.full_name || "Driver")
                  .split(" ")
                  .map((n: string) => n[0])
                  .join("")
                  .toUpperCase()
                  .slice(0, 2)}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <p className="text-sm font-semibold truncate" data-testid="text-driver-name">
                {order.driver_details.full_name || "Driver"}
              </p>
              <a
                href={`tel:${order.driver_details.phone}`}
                className="text-sm text-primary hover:underline"
                data-testid="text-driver-phone"
              >
                {order.driver_details.phone || "Phone not available"}
              </a>
            </div>
          </div>
          {order.confirmed_delivery_time && (
            <div className="mt-3 rounded-lg border border-border/50 bg-background/60 px-2.5 py-2">
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Confirmed delivery</p>
              <p className="text-xs font-medium" data-testid="text-confirmed-delivery-time">
                {new Date(order.confirmed_delivery_time).toLocaleString("en-ZA", {
                  dateStyle: "medium",
                  timeStyle: "short",
                  timeZone: "Africa/Johannesburg",
                })}
              </p>
            </div>
          )}
        </div>
      ) : null}

      <div className="rounded-xl border border-border/60 bg-muted/20 p-3">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">Order total</p>
        <p className="text-lg font-semibold text-primary" data-testid="text-sidebar-total">
          {formatCurrency(pricingBreakdown.total, currency)}
        </p>
      </div>
    </>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(
          "flex flex-col gap-0 overflow-hidden p-0",
          "w-[calc(100%-1.5rem)] max-w-[calc(100vw-1.5rem)]",
          "max-h-[min(92dvh,92vh)] h-[min(92dvh,92vh)]",
          "top-[4dvh] translate-y-0 sm:top-[50%] sm:translate-y-[-50%]",
          "transition-[max-width] duration-200",
          isSplitTab ? "sm:max-w-[920px]" : "sm:max-w-[640px]",
        )}
        data-testid="dialog-view-order"
      >
        <div className="shrink-0 px-6 pt-6 pb-3">
          <DialogHeader>
            <div className="flex items-center justify-between gap-3">
              <DialogTitle>Order Details</DialogTitle>
              <StatusBadge status={order.state} />
            </div>
            <DialogDescription className="truncate">
              Order ID: {order.id}
            </DialogDescription>
          </DialogHeader>
        </div>

        {!isEditing ? (
          <>
            <Tabs
              value={activeTab}
              onValueChange={setActiveTab}
              className="flex min-h-0 flex-1 flex-col px-6"
            >
              <TabsList className="grid h-11 w-full shrink-0 grid-cols-3 bg-muted/70 p-1">
                <TabsTrigger value="details" className="gap-1.5 text-xs sm:text-sm" data-testid="tab-order-details">
                  <Package className="h-3.5 w-3.5" />
                  Details
                </TabsTrigger>
                <TabsTrigger value="tracking" className="gap-1.5 text-xs sm:text-sm" data-testid="tab-order-tracking">
                  <Navigation className="h-3.5 w-3.5" />
                  Tracking
                </TabsTrigger>
                <TabsTrigger value="chat" className="gap-1.5 text-xs sm:text-sm" data-testid="tab-order-chat">
                  <MessageCircle className="h-3.5 w-3.5" />
                  Chat
                </TabsTrigger>
              </TabsList>

              <div className="mt-3 min-h-0 flex-1 overflow-y-auto overscroll-contain pr-1 -mr-1 pb-2">
              <TabsContent value="details" className="mt-0 focus-visible:outline-none data-[state=inactive]:hidden">
                  <div className="space-y-4 pb-2">
                    {orderSummarySidebar}
                  {order.time_window && (
                    <div className="flex items-center gap-3 p-3 rounded-lg border border-border/60 bg-muted/30">
                      <Calendar className="h-4 w-4 text-muted-foreground shrink-0" />
                      <div>
                        <p className="text-sm font-medium">Time Window</p>
                        <p className="text-sm text-muted-foreground">{order.time_window}</p>
                      </div>
                    </div>
                  )}

                  {(loadingQuotes || driverQuotes.length > 0) && (
                    <div className="space-y-3 border border-border/60 rounded-xl p-3 bg-background/60">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-medium">Available Drivers</p>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            Prices calculated automatically based on driver pricing and distance
                          </p>
                        </div>
                        {loadingQuotes && (
                          <span className="flex items-center gap-2 text-xs text-muted-foreground">
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            Loading…
                          </span>
                        )}
                      </div>

                      {!loadingQuotes && driverQuotes.length === 0 ? (
                        <p className="text-xs text-muted-foreground">
                          No drivers available yet. We'll notify you as soon as drivers become available.
                        </p>
                      ) : (
                        <div className="space-y-3">
                          {[...driverQuotes]
                            .sort((a: any, b: any) => {
                              const totalA = a.estimatedPricing?.total || 0;
                              const totalB = b.estimatedPricing?.total || 0;
                              return totalA - totalB;
                            })
                            .map((quote: any) => {
                              const estimatedPricing = quote.estimatedPricing || {};
                              const totalPrice = estimatedPricing.total || 0;
                              const fuelCost = estimatedPricing.fuelCost || 0;
                              const deliveryFee = estimatedPricing.deliveryFee || 0;
                              const distanceKm = estimatedPricing.distanceKm || 0;
                              const pricePerKmCents = estimatedPricing.pricePerKmCents || quote.proposed_price_per_km_cents || 0;
                              const pricePerKm = pricePerKmCents / 100;
                              const driverName = quote.driver?.profile?.fullName || "Driver";
                              const isPendingDecision = !order.assigned_driver_id && quote.state === "pending_customer";
                              const isAccepted = quote.state === "customer_accepted";
                              const isDeclined = quote.state === "customer_declined";
                              const isResponded = quote.state === "customer_accepted" || quote.state === "customer_declined";
                              const isProcessing =
                                acceptDriverOfferMutation.isPending &&
                                acceptDriverOfferMutation.variables === quote.id;
                              const driverProfilePhotoUrl =
                                quote.driver?.profile?.profile_photo_url || quote.driver?.profile?.profilePhotoUrl;

                              return (
                                <div
                                  key={quote.id}
                                  className={`border rounded-lg p-3 space-y-3 ${
                                    isPendingDecision
                                      ? "border-primary/50 bg-primary/5 hover:border-primary/70 transition-colors"
                                      : "border-border"
                                  }`}
                                >
                                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                                    <div className="flex items-start gap-3 flex-1 min-w-0">
                                      <Avatar className="h-10 w-10 shrink-0">
                                        <AvatarImage
                                          src={normalizeProfilePhotoUrl(driverProfilePhotoUrl) || undefined}
                                          alt={driverName}
                                          onError={() => {}}
                                        />
                                        <AvatarFallback className="bg-primary text-primary-foreground text-xs">
                                          {driverName
                                            .split(" ")
                                            .map((n: string) => n[0])
                                            .join("")
                                            .toUpperCase()
                                            .slice(0, 2)}
                                        </AvatarFallback>
                                      </Avatar>
                                      <div className="min-w-0">
                                        <p className="text-sm font-semibold truncate">{driverName}</p>
                                        {quote.driver?.profile?.phone && (
                                          <p className="text-xs text-muted-foreground">
                                            <a
                                              href={`tel:${quote.driver.profile.phone}`}
                                              className="text-primary hover:underline"
                                            >
                                              {quote.driver.profile.phone}
                                            </a>
                                          </p>
                                        )}
                                      </div>
                                    </div>
                                    <div className="text-left sm:text-right shrink-0">
                                      <p className="text-lg font-bold text-primary">
                                        {formatCurrency(totalPrice, currency)}
                                      </p>
                                      <p className="text-xs text-muted-foreground">Total Price</p>
                                    </div>
                                  </div>

                                  <div className="grid grid-cols-2 gap-2 text-xs border-t pt-2">
                                    <div>
                                      <p className="text-muted-foreground">Fuel Cost</p>
                                      <p className="font-medium">{formatCurrency(fuelCost, currency)}</p>
                                    </div>
                                    <div>
                                      <p className="text-muted-foreground">Delivery Fee</p>
                                      <p className="font-medium">
                                        {formatCurrency(deliveryFee, currency)}
                                        {distanceKm > 0 && (
                                          <span className="text-muted-foreground ml-1">
                                            ({distanceKm.toFixed(1)} km × {formatCurrency(pricePerKm, currency)}/km)
                                          </span>
                                        )}
                                      </p>
                                    </div>
                                  </div>

                                  {quote.proposed_notes && (
                                    <div className="rounded-md bg-muted/60 p-2 text-xs text-muted-foreground border border-border/70">
                                      {quote.proposed_notes}
                                    </div>
                                  )}

                                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                                    <div className="flex items-center gap-2">
                                      {isAccepted && (
                                        <Badge className="bg-green-600 text-white gap-1">
                                          <CheckCircle2 className="h-3 w-3" />
                                          Accepted
                                        </Badge>
                                      )}
                                      {isDeclined && (
                                        <Badge variant="outline" className="text-xs gap-1 text-muted-foreground">
                                          <XCircle className="h-3 w-3" />
                                          Declined
                                        </Badge>
                                      )}
                                      {quote.state === "pending_customer" && (
                                        <Badge variant="outline" className="text-xs text-primary">
                                          Available
                                        </Badge>
                                      )}
                                    </div>

                                    {isPendingDecision && (
                                      <Button
                                        size="sm"
                                        onClick={() => handleAcceptDriverQuote(quote.id)}
                                        disabled={isProcessing}
                                        data-testid={`button-accept-driver-quote-${quote.id}`}
                                      >
                                        {isProcessing ? (
                                          <>
                                            <Loader2 className="h-4 w-4 animate-spin mr-2" />
                                            Selecting…
                                          </>
                                        ) : (
                                          "Select Driver"
                                        )}
                                      </Button>
                                    )}

                                    {isResponded && !isPendingDecision && (
                                      <p className="text-xs text-muted-foreground">
                                        Updated{" "}
                                        {quote.customer_response_at
                                          ? new Date(quote.customer_response_at).toLocaleString("en-ZA", {
                                              dateStyle: "medium",
                                              timeStyle: "short",
                                              timeZone: "Africa/Johannesburg",
                                            })
                                          : new Date(quote.updated_at).toLocaleString("en-ZA", {
                                              dateStyle: "medium",
                                              timeStyle: "short",
                                              timeZone: "Africa/Johannesburg",
                                            })}
                                      </p>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                        </div>
                      )}
                    </div>
                  )}

                  {order.state === "delivered" ? <DeliverySignatureProof order={order} /> : null}

                  <div className="rounded-xl border border-border/60 p-3 space-y-2 bg-muted/20">
                    <p className="text-sm font-medium">Pricing</p>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Fuel Cost</span>
                      <span data-testid="text-fuel-cost">
                        {formatCurrency(pricingBreakdown.fuelCost, currency)}
                      </span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Delivery Fee</span>
                      <span data-testid="text-delivery-fee">
                        {formatCurrency(pricingBreakdown.deliveryFee, currency)}
                      </span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Service Fee</span>
                      <span data-testid="text-service-fee">
                        {formatCurrency(pricingBreakdown.serviceFee, currency)}
                      </span>
                    </div>
                    <div className="flex justify-between font-semibold pt-2 border-t">
                      <span>Total</span>
                      <span className="text-primary" data-testid="text-total">
                        {formatCurrency(pricingBreakdown.total, currency)}
                      </span>
                    </div>
                  </div>
                  </div>
              </TabsContent>

              <TabsContent value="tracking" className="mt-0 focus-visible:outline-none data-[state=inactive]:hidden">
                <div className="flex flex-col gap-4 sm:flex-row sm:min-h-[min(52dvh,480px)]">
                  <aside className="sm:w-[260px] shrink-0 sm:border-r sm:border-border/50 sm:pr-4 space-y-3">
                    {orderSummarySidebar}
                  </aside>
                  <div className="flex-1 min-w-0 min-h-[360px] flex flex-col w-full">
                    {!showTrackingMap ? (
                      <div className="flex flex-1 min-h-[360px] flex-col items-center justify-center rounded-xl border border-dashed border-border/70 bg-muted/20 px-6 text-center">
                        <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-muted">
                          <Navigation className="h-6 w-6 text-muted-foreground" />
                        </div>
                        <p className="font-medium">Live tracking not available yet</p>
                        <p className="mt-1 max-w-sm text-sm text-muted-foreground">
                          Tracking opens once a driver is assigned and your delivery is in progress.
                        </p>
                      </div>
                    ) : activeTab === "tracking" ? (
                      <div className="flex-1 rounded-xl overflow-hidden border border-border/60 min-h-[360px] w-full">
                        <DriverLocationMap
                          key={`tracking-map-${order.id}`}
                          orderId={order.id}
                          deliveryLat={Number(order.drop_lat ?? order.dropLat)}
                          deliveryLng={Number(order.drop_lng ?? order.dropLng)}
                          className="h-full border-0 shadow-none"
                        />
                      </div>
                    ) : null}
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="chat" className="mt-0 focus-visible:outline-none data-[state=inactive]:hidden">
                <div className="flex flex-col gap-4 sm:flex-row sm:min-h-[min(52dvh,480px)]">
                  <aside className="sm:w-[260px] shrink-0 sm:border-r sm:border-border/50 sm:pr-4 space-y-3">
                    {orderSummarySidebar}
                  </aside>
                  <div className="flex-1 min-w-0 min-h-[360px] flex flex-col">
                    {canShowChat ? (
                      <div className="flex-1 min-h-[360px] rounded-xl border border-border/60 overflow-hidden">
                        <OrderChat
                          orderId={order.id}
                          currentUserType="customer"
                          readOnly={chatReadOnly}
                          variant="embedded"
                        />
                      </div>
                    ) : (
                      <div className="flex flex-1 min-h-[360px] flex-col items-center justify-center rounded-xl border border-dashed border-border/70 bg-muted/20 px-6 text-center">
                        <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-muted">
                          <MessageCircle className="h-6 w-6 text-muted-foreground" />
                        </div>
                        <p className="font-medium">Chat not available yet</p>
                        <p className="mt-1 max-w-sm text-sm text-muted-foreground">
                          Message your driver here after you assign one to your order.
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              </TabsContent>
              </div>
            </Tabs>

            <div className="shrink-0 flex justify-end gap-3 flex-wrap border-t bg-background px-6 py-3 sm:py-4">
              {canPay && (
                <Button
                  onClick={() => payOrderMutation.mutate()}
                  disabled={payOrderMutation.isPending}
                  className="gap-2"
                  data-testid="button-pay-order"
                >
                  {payOrderMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <CreditCard className="h-4 w-4" />
                  )}
                  Pay with Ozow
                </Button>
              )}
              {canCancel && (
                <Button
                  variant="destructive"
                  onClick={handleCancel}
                  disabled={cancelOrderMutation.isPending}
                  data-testid="button-cancel-order"
                >
                  {cancelOrderMutation.isPending ? "Cancelling..." : "Cancel Order"}
                </Button>
              )}
              {canEdit && (
                <Button onClick={() => setIsEditing(true)} data-testid="button-edit-order">
                  Edit Order
                </Button>
              )}
            </div>
          </>
        ) : (
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden px-6 pb-6">
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="flex min-h-0 flex-1 flex-col space-y-4">
              <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pr-1 -mr-1">
              <FormField
                control={form.control}
                name="fuelTypeId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Fuel Type</FormLabel>
                    <Select
                      onValueChange={field.onChange}
                      defaultValue={field.value}
                      disabled={loadingFuelTypes}
                    >
                      <FormControl>
                        <SelectTrigger data-testid="select-edit-fuel-type">
                          <SelectValue placeholder="Select fuel type" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {fuelTypes.map((fuelType) => (
                          <SelectItem
                            key={fuelType.id}
                            value={fuelType.id}
                            data-testid={`option-edit-fuel-type-${fuelType.code}`}
                          >
                            {fuelType.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="litres"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Litres</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        placeholder="e.g. 500"
                        {...field}
                        data-testid="input-edit-litres"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="dropLat"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Latitude</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          step="any"
                          placeholder="e.g. -26.2041"
                          {...field}
                          data-testid="input-edit-latitude"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="dropLng"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Longitude</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          step="any"
                          placeholder="e.g. 28.0473"
                          {...field}
                          data-testid="input-edit-longitude"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="timeWindow"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Time Window (Optional)</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="e.g. 9:00 AM - 5:00 PM"
                        {...field}
                        data-testid="input-edit-time-window"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              </div>

              <div className="flex shrink-0 justify-end gap-3 border-t pt-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsEditing(false)}
                  data-testid="button-cancel-edit"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={updateOrderMutation.isPending}
                  data-testid="button-save-order"
                >
                  {updateOrderMutation.isPending ? "Saving..." : "Save Changes"}
                </Button>
              </div>
            </form>
          </Form>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
