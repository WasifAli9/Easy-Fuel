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
import { MapPin, Calendar, Package, User, Phone, Clock, Loader2, CheckCircle2, XCircle } from "lucide-react";
import { StatusBadge } from "./StatusBadge";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { DriverLocationMap } from "./DriverLocationMap";
import { OrderChat } from "./OrderChat";
import { useCurrency } from "@/hooks/use-currency";
import { ScrollArea } from "@/components/ui/scroll-area";
import { formatCurrency } from "@/lib/utils";
import { useWebSocket } from "@/hooks/useWebSocket";

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
  const { toast } = useToast();
  const { currencySymbol, currency } = useCurrency();

  // Fetch order details
  const { data: order, isLoading: loadingOrder } = useQuery<any>({
    queryKey: ["/api/orders", orderId],
    enabled: open && !!orderId,
    refetchInterval: 5000, // Poll every 5 seconds for real-time updates
    staleTime: 0,
  });

  const { data: driverQuotes = [], isLoading: loadingQuotes } = useQuery<any[]>({
    queryKey: ["/api/orders", orderId, "offers"],
    enabled: open && !!orderId,
    refetchInterval: 5000, // Poll every 5 seconds for real-time updates
    staleTime: 0,
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
        <DialogContent data-testid="dialog-view-order">
          <div className="flex items-center justify-center py-8">
            <p className="text-muted-foreground">Loading order details...</p>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  if (!order) {
    return null;
  }

  const canEdit = ["created", "awaiting_payment"].includes(order.state);
  const canCancel = !["delivered", "cancelled", "picked_up", "en_route"].includes(order.state);
  // Chat is available from when driver is assigned until order is completed (delivered)
  const canUseChat =
    order.assigned_driver_id &&
    ["assigned", "en_route", "picked_up"].includes(order.state) &&
    order.chat_enabled !== false;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-hidden" data-testid="dialog-view-order">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <DialogTitle>Order Details</DialogTitle>
            <StatusBadge status={order.state} />
          </div>
          <DialogDescription>
            Order ID: {order.id}
          </DialogDescription>
        </DialogHeader>

        {!isEditing ? (
          <ScrollArea className="max-h-[65vh] pr-4">
            <div className="space-y-4">
            {/* Order Summary */}
            <div className="space-y-3">
              <div className="flex items-center gap-3 p-3 bg-muted rounded-lg">
                <Package className="h-5 w-5 text-muted-foreground" />
                <div>
                  <p className="font-semibold" data-testid="text-fuel-type">
                    {order.fuel_types?.label || "Unknown"}
                  </p>
                  <p className="text-sm text-muted-foreground" data-testid="text-litres">
                    {order.litres}L
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3 p-3 bg-muted rounded-lg">
                <MapPin className="h-5 w-5 mt-0.5 text-muted-foreground" />
                <div className="flex-1">
                  <p className="text-sm font-medium">Delivery Location</p>
                  <p className="text-sm text-muted-foreground" data-testid="text-coordinates">
                    {order.drop_lat}, {order.drop_lng}
                  </p>
                </div>
              </div>

              {order.time_window && (
                <div className="flex items-center gap-3 p-3 bg-muted rounded-lg">
                  <Calendar className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <p className="text-sm font-medium">Time Window</p>
                    <p className="text-sm text-muted-foreground">{order.time_window}</p>
                  </div>
                </div>
              )}

              {(loadingQuotes || driverQuotes.length > 0) && (
                <div className="space-y-3 border border-border/60 rounded-lg p-3 bg-background/60">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium">Driver Quotes</p>
                    {loadingQuotes && (
                      <span className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        Loading…
                      </span>
                    )}
                  </div>

                    {!loadingQuotes && driverQuotes.length === 0 ? (
                      <p className="text-xs text-muted-foreground">
                        No driver quotes yet. We’ll notify you as soon as a driver responds.
                      </p>
                    ) : (
                      <div className="space-y-3">
                        {driverQuotes.map((quote: any) => {
                          const pricePerKm = (Number(quote.proposed_price_per_km_cents) || 0) / 100;
                          // Calculate estimated total (will be finalized when accepted)
                          const litres = parseFloat(order.litres || 0);
                          const fuelPricePerLiter = (order.fuel_price_cents || 0) / 100;
                          const estimatedFuelCost = fuelPricePerLiter * litres;
                          // Note: Delivery fee will be calculated as price_per_km * distance_km when accepted
                          const proposedTime = quote.proposed_delivery_time
                            ? new Date(quote.proposed_delivery_time).toLocaleString("en-ZA", {
                                dateStyle: "medium",
                                timeStyle: "short",
                                timeZone: "Africa/Johannesburg",
                              })
                            : "Not specified";
                          const driverName = quote.driver?.profile?.fullName || "Driver";
                          const isPendingDecision = !order.assigned_driver_id && quote.state === "pending_customer";
                          const isAccepted = quote.state === "customer_accepted";
                          const isDeclined = quote.state === "customer_declined";
                          const isResponded = quote.state === "customer_accepted" || quote.state === "customer_declined";
                          const isProcessing =
                            acceptDriverOfferMutation.isPending &&
                            acceptDriverOfferMutation.variables === quote.id;

                          const driverProfilePhotoUrl = quote.driver?.profile?.profile_photo_url || quote.driver?.profile?.profilePhotoUrl;
                          
                          return (
                            <div key={quote.id} className="border border-border rounded-lg p-3 space-y-3">
                              <div className="flex items-start justify-between gap-3">
                                <div className="flex items-start gap-3 flex-1">
                                  <Avatar className="h-10 w-10 flex-shrink-0">
                                    <AvatarImage 
                                      src={
                                        driverProfilePhotoUrl 
                                          ? driverProfilePhotoUrl.includes('/') && !driverProfilePhotoUrl.startsWith('/') && !driverProfilePhotoUrl.startsWith('http')
                                            ? `${import.meta.env.VITE_SUPABASE_URL || 'https://piejkqvpkxnrnudztrmt.supabase.co'}/storage/v1/object/public/${driverProfilePhotoUrl}`
                                            : driverProfilePhotoUrl.startsWith('/')
                                              ? driverProfilePhotoUrl
                                              : `/objects/${driverProfilePhotoUrl}`
                                          : undefined
                                      } 
                                      alt={driverName} 
                                    />
                                    <AvatarFallback className="bg-primary text-primary-foreground text-xs">
                                      {driverName.split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2)}
                                    </AvatarFallback>
                                  </Avatar>
                                  <div>
                                    <p className="text-sm font-semibold">{driverName}</p>
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
                                    {quote.driver?.premiumStatus === "active" && (
                                      <Badge variant="outline" className="mt-1 text-xs">
                                        Premium Driver
                                      </Badge>
                                    )}
                                  </div>
                                </div>
                                <div className="text-right">
                                  <p className="text-sm font-semibold text-primary">
                                    {formatCurrency(pricePerKm, currency)}/km
                                  </p>
                                  <p className="text-xs text-muted-foreground">Price per km</p>
                                </div>
                              </div>

                              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                <Calendar className="h-3.5 w-3.5" />
                                <span>{proposedTime}</span>
                              </div>

                              {quote.proposed_notes && (
                                <div className="rounded-md bg-muted/60 p-2 text-xs text-muted-foreground border border-border/70">
                                  {quote.proposed_notes}
                                </div>
                              )}

                              <div className="flex items-center justify-between">
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
                                      Awaiting your decision
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
                                        Accepting…
                                      </>
                                    ) : (
                                      "Accept Quote"
                                    )}
                                  </Button>
                                )}

                                {isResponded && !isPendingDecision && (
                                  <p className="text-xs text-muted-foreground">
                                    Updated {quote.customer_response_at
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

              {/* Driver Information - Show when driver is assigned */}
              {order.assigned_driver_id && order.driver_details && (
                <div className="border-2 border-primary/20 rounded-lg p-4 space-y-3 bg-primary/5">
                  <div className="flex items-center gap-2 mb-2">
                    <Badge variant="default" className="bg-primary">
                      Driver Assigned
                    </Badge>
                  </div>
                  
                  <div className="space-y-2">
                    <div className="flex items-center gap-3">
                      <Avatar className="h-10 w-10 flex-shrink-0">
                        <AvatarImage 
                          src={
                            order.driver_details.profile_photo_url
                              ? order.driver_details.profile_photo_url.includes('/') && !order.driver_details.profile_photo_url.startsWith('/') && !order.driver_details.profile_photo_url.startsWith('http')
                                ? `${import.meta.env.VITE_SUPABASE_URL || 'https://piejkqvpkxnrnudztrmt.supabase.co'}/storage/v1/object/public/${order.driver_details.profile_photo_url}`
                                : order.driver_details.profile_photo_url.startsWith('/')
                                  ? order.driver_details.profile_photo_url
                                  : `/objects/${order.driver_details.profile_photo_url}`
                              : undefined
                          } 
                          alt={order.driver_details.full_name || "Driver"} 
                        />
                        <AvatarFallback className="bg-primary text-primary-foreground text-xs">
                          {(order.driver_details.full_name || "Driver").split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2)}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <p className="text-sm font-medium">Driver Name</p>
                        <p className="text-sm" data-testid="text-driver-name">
                          {order.driver_details.full_name || "Driver"}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <Phone className="h-4 w-4 text-muted-foreground" />
                      <div>
                        <p className="text-sm font-medium">Driver Phone</p>
                        <p className="text-sm" data-testid="text-driver-phone">
                          <a 
                            href={`tel:${order.driver_details.phone}`}
                            className="text-primary hover:underline"
                          >
                            {order.driver_details.phone || "Not available"}
                          </a>
                        </p>
                      </div>
                    </div>

                    {order.confirmed_delivery_time && (
                      <div className="flex items-center gap-3">
                        <Clock className="h-4 w-4 text-muted-foreground" />
                        <div>
                          <p className="text-sm font-medium">Confirmed Delivery Time</p>
                          <p className="text-sm" data-testid="text-confirmed-delivery-time">
                            {new Date(order.confirmed_delivery_time).toLocaleString("en-ZA", {
                              dateStyle: "medium",
                              timeStyle: "short",
                              timeZone: "Africa/Johannesburg",
                            })}
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Chat with driver - Show when driver is assigned until order is completed */}
              {canUseChat && (
                <div className="space-y-4">
                  <OrderChat
                    orderId={order.id}
                    currentUserType="customer"
                  />
                </div>
              )}

              {/* Live GPS Tracking Map - Show when driver is en_route until delivered */}
              {order.assigned_driver_id && ["en_route", "picked_up"].includes(order.state) && (
                <div className="space-y-4">
                  <DriverLocationMap
                    orderId={order.id}
                    deliveryLat={order.drop_lat}
                    deliveryLng={order.drop_lng}
                  />
                </div>
              )}
              
              {/* Debug: Show why map isn't showing (remove in production) */}
              {process.env.NODE_ENV === 'development' && !order.assigned_driver_id && ["en_route", "picked_up"].includes(order.state) && (
                <div className="text-xs text-muted-foreground p-2 bg-yellow-50 dark:bg-yellow-900/20 rounded">
                  Debug: Map not showing - No assigned_driver_id. Order state: {order.state}
                </div>
              )}
              {process.env.NODE_ENV === 'development' && order.assigned_driver_id && !["en_route", "picked_up"].includes(order.state) && order.state !== "delivered" && (
                <div className="text-xs text-muted-foreground p-2 bg-yellow-50 dark:bg-yellow-900/20 rounded">
                  Debug: Map not showing - Order state is "{order.state}" (needs "en_route" or "picked_up")
                </div>
              )}

              {/* Pricing Breakdown */}
              <div className="border-t pt-3 space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Fuel Cost</span>
                  <span data-testid="text-fuel-cost">
                    {currencySymbol} {pricingBreakdown.fuelCost.toFixed(2)}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Delivery Fee</span>
                  <span data-testid="text-delivery-fee">
                    {currencySymbol} {pricingBreakdown.deliveryFee.toFixed(2)}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Service Fee</span>
                  <span data-testid="text-service-fee">
                    {currencySymbol} {pricingBreakdown.serviceFee.toFixed(2)}
                  </span>
                </div>
                <div className="flex justify-between font-semibold pt-2 border-t">
                  <span>Total</span>
                  <span className="text-primary" data-testid="text-total">
                    {currencySymbol} {pricingBreakdown.total.toFixed(2)}
                  </span>
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="flex justify-end gap-3 pt-4">
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
                <Button
                  onClick={() => setIsEditing(true)}
                  data-testid="button-edit-order"
                >
                  Edit Order
                </Button>
              )}
            </div>
            </div>
          </ScrollArea>
        ) : (
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
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

              <div className="flex justify-end gap-3 pt-4">
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
        )}
      </DialogContent>
    </Dialog>
  );
}
