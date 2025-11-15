import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { AppHeader } from "@/components/AppHeader";
import { JobCard } from "@/components/JobCard";
import { StatsCard } from "@/components/StatsCard";
import { DriverPricingManager } from "@/components/DriverPricingManager";
import { DriverVehicleManager } from "@/components/DriverVehicleManager";
import { DriverPreferencesManager } from "@/components/DriverPreferencesManager";
import { DriverLocationTracker } from "@/components/DriverLocationTracker";
import { OrderChat } from "@/components/OrderChat";
import { Wallet, TrendingUp, CheckCircle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/StatusBadge";
import { useCurrency } from "@/hooks/use-currency";
import { formatCurrency } from "@/lib/utils";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AcceptOfferDialog } from "@/components/AcceptOfferDialog";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { CompleteDeliveryDialog } from "@/components/CompleteDeliveryDialog";
import { useWebSocket } from "@/hooks/useWebSocket";

export default function DriverDashboard() {
  const [selectedOfferId, setSelectedOfferId] = useState<string | null>(null);
  const [acceptDialogOpen, setAcceptDialogOpen] = useState(false);
  const [dismissedPendingOfferOrderIds, setDismissedPendingOfferOrderIds] = useState<string[]>([]);
  const [orderToComplete, setOrderToComplete] = useState<any | null>(null);
  const [completeDialogOpen, setCompleteDialogOpen] = useState(false);
  const { toast } = useToast();

  // Fetch available dispatch offers
  const { data: offersData, isLoading, error: offersError, refetch: refetchOffers } = useQuery<any>({
    queryKey: ["/api/driver/offers"],
    refetchInterval: 60000, // Refresh every 60 seconds (WebSocket handles real-time)
  });

  // Handle both array response (offers) and object response (with eligibility info)
  const offers = Array.isArray(offersData) ? offersData : (offersData?.offers || []);
  const eligibilityIssues = offersData?.eligibilityIssues || [];
  const driverStatus = offersData?.driverStatus;

  const filteredOffers = offers.filter((offer: any) => {
    if (offer.isPendingOffer && dismissedPendingOfferOrderIds.includes(offer.order_id)) {
      return false;
    }
    if (offer.isPendingOffer && offer.id?.startsWith("pending-")) {
      const baseId = offer.id.replace("pending-", "");
      if (dismissedPendingOfferOrderIds.includes(baseId)) {
        return false;
      }
    }
    return true;
  });

  // Fetch driver profile to check availability status
  const { data: driverProfile } = useQuery<any>({
    queryKey: ["/api/driver/profile"],
  });

  const { data: statsData, isLoading: statsLoading } = useQuery<{
    activeJobs: number;
    todayEarningsCents: number;
    completedThisWeek: number;
    totalEarningsCents: number;
    totalDeliveries: number;
  }>({
    queryKey: ["/api/driver/stats"],
  });

  // Fetch assigned orders (accepted deliveries)
  const { data: assignedOrders = [], isLoading: loadingAssigned } = useQuery<any[]>({
    queryKey: ["/api/driver/assigned-orders"],
    refetchInterval: 15000, // Refresh every 15 seconds
  });

  // Fetch completed orders (last week)
  const { data: completedOrders = [], isLoading: loadingCompleted } = useQuery<any[]>({
    queryKey: ["/api/driver/completed-orders"],
    refetchInterval: 60000, // Refresh every 60 seconds
  });

  const { currency } = useCurrency();

  // Set up WebSocket to refresh offers when new orders arrive
  useWebSocket((message) => {
    if (message.type === "dispatch_offer" || message.type === "notification") {
      // Refresh offers when new dispatch offers arrive
      refetchOffers();
    }
  });
  
  // Helper function to format currency using the user's preferred currency
  const formatCurrencyAmount = (amount: number) => formatCurrency(amount, currency);

  const todayEarningsDisplay = statsLoading
    ? "..."
    : formatCurrencyAmount((statsData?.todayEarningsCents || 0) / 100);

  const activeJobsDisplay = statsLoading ? "..." : (statsData?.activeJobs || 0);
  const completedThisWeekDisplay = statsLoading ? "..." : (statsData?.completedThisWeek || 0);

  // Reject offer mutation
  const rejectOfferMutation = useMutation({
    mutationFn: async (offerId: string) => {
      const response = await apiRequest("POST", `/api/driver/offers/${offerId}/reject`);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/driver/offers"] });
      toast({
        title: "Offer rejected",
        description: "You have declined this delivery offer",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to reject offer",
        variant: "destructive",
      });
    },
  });

  const startDeliveryMutation = useMutation({
    mutationFn: async (orderId: string) => {
      const response = await apiRequest("POST", `/api/driver/orders/${orderId}/start`);
      return response.json();
    },
    onSuccess: (_data, orderId) => {
      queryClient.invalidateQueries({ queryKey: ["/api/driver/assigned-orders"] });
      queryClient.invalidateQueries({ queryKey: ["/api/driver/stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/driver/profile"] });
      toast({
        title: "Delivery started",
        description: `You are now en route for order ${orderId.substring(0, 8).toUpperCase()}`,
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to start delivery",
        variant: "destructive",
      });
    },
  });

  const pickupDeliveryMutation = useMutation({
    mutationFn: async (orderId: string) => {
      const response = await apiRequest("POST", `/api/driver/orders/${orderId}/pickup`);
      return response.json();
    },
    onSuccess: (_data, orderId) => {
      queryClient.invalidateQueries({ queryKey: ["/api/driver/assigned-orders"] });
      queryClient.invalidateQueries({ queryKey: ["/api/driver/stats"] });
      toast({
        title: "Fuel collected",
        description: `Marked order ${orderId.substring(0, 8).toUpperCase()} as picked up`,
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to mark fuel as picked up",
        variant: "destructive",
      });
    },
  });

  const handleStartDelivery = (orderId: string) => {
    startDeliveryMutation.mutate(orderId);
  };

  const handlePickupDelivery = (orderId: string) => {
    pickupDeliveryMutation.mutate(orderId);
  };

  const handleCompleteDelivery = (order: any) => {
    setOrderToComplete(order);
    setCompleteDialogOpen(true);
  };

  const handleAccept = (offerId: string) => {
    setSelectedOfferId(offerId);
    setAcceptDialogOpen(true);
  };

  const handleReject = (offerId: string) => {
    if (confirm("Are you sure you want to reject this offer?")) {
      if (offerId.startsWith("pending-")) {
        const orderId = offerId.replace("pending-", "");
        setDismissedPendingOfferOrderIds((prev) => Array.from(new Set([...prev, orderId])));
        toast({
          title: "Offer dismissed",
          description: "This request will be hidden until a formal offer is created.",
        });
        return;
      }

      rejectOfferMutation.mutate(offerId);
    }
  };

  return (
    <div className="min-h-screen bg-background pb-safe">
      <AppHeader />
      
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-8">
        <div className="mb-4 sm:mb-8">
          <h1 className="text-2xl sm:text-3xl font-bold mb-1">Driver Dashboard</h1>
          <p className="text-sm text-muted-foreground">Manage your deliveries and earnings</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4 mb-4 sm:mb-8">
          <StatsCard
            title="Today's Earnings"
            value={todayEarningsDisplay}
            icon={Wallet}
          />
          <StatsCard
            title="Active Jobs"
            value={activeJobsDisplay}
            description="In progress"
            icon={TrendingUp}
          />
          <StatsCard
            title="Completed"
            value={completedThisWeekDisplay}
            description="This week"
            icon={CheckCircle}
          />
        </div>

        <Tabs defaultValue="available" className="space-y-4 sm:space-y-6">
          <div className="overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0 scrollbar-hide">
            <TabsList className="min-w-max w-full sm:w-auto grid grid-cols-6 sm:inline-flex">
              <TabsTrigger value="available" data-testid="tab-available" className="text-xs sm:text-sm">Available</TabsTrigger>
              <TabsTrigger value="assigned" data-testid="tab-assigned" className="text-xs sm:text-sm">My Jobs</TabsTrigger>
              <TabsTrigger value="vehicles" data-testid="tab-vehicles" className="text-xs sm:text-sm">Vehicles</TabsTrigger>
              <TabsTrigger value="pricing" data-testid="tab-pricing" className="text-xs sm:text-sm">Pricing</TabsTrigger>
              <TabsTrigger value="settings" data-testid="tab-settings" className="text-xs sm:text-sm">Settings</TabsTrigger>
              <TabsTrigger value="history" data-testid="tab-history" className="text-xs sm:text-sm">History</TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="available" className="space-y-3 sm:space-y-4">
            {isLoading ? (
              <div className="text-center py-8 text-muted-foreground">Loading offers...</div>
            ) : offersError ? (
              <div className="text-center py-8 sm:py-12">
                <p className="text-destructive mb-2">Error loading offers</p>
                <p className="text-sm text-muted-foreground">{offersError.message || "Please try again later"}</p>
              </div>
            ) : eligibilityIssues.length > 0 ? (
              <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4 sm:p-6">
                <h3 className="font-semibold mb-2 text-yellow-900 dark:text-yellow-100">Account Setup Required</h3>
                <p className="text-sm text-yellow-800 dark:text-yellow-200 mb-3">
                  To receive delivery offers, please complete the following:
                </p>
                <ul className="list-disc list-inside space-y-1 text-sm text-yellow-800 dark:text-yellow-200 mb-4">
                  {eligibilityIssues.map((issue: string, index: number) => (
                    <li key={index}>{issue}</li>
                  ))}
                </ul>
                <div className="text-xs text-yellow-700 dark:text-yellow-300 mt-4 p-3 bg-yellow-100 dark:bg-yellow-900/30 rounded">
                  <p className="font-medium mb-1">Current Status:</p>
                  {driverStatus && (
                    <ul className="space-y-1">
                      <li>Location Set: <span className="font-mono">{driverStatus.hasLocation ? "Yes" : "No"}</span></li>
                    </ul>
                  )}
                </div>
              </div>
            ) : filteredOffers.length === 0 ? (
              <div className="text-center py-8 sm:py-12 text-muted-foreground">
                <p>No available offers at the moment</p>
                <p className="text-sm mt-2">New delivery requests will appear here</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 sm:gap-4">
                {filteredOffers.map((offer) => {
                  const order = offer.orders;
                  const deliveryAddress = order.delivery_addresses 
                    ? `${order.delivery_addresses.address_street}, ${order.delivery_addresses.address_city}`
                    : `${order.drop_lat}, ${order.drop_lng}`;
                  
                  // Calculate expires in seconds (for pending offers, use a default long expiry)
                  const expiresInSeconds = offer.expires_at 
                    ? Math.floor((new Date(offer.expires_at).getTime() - Date.now()) / 1000)
                    : 24 * 60 * 60; // 24 hours default for pending offers

                  const isPendingOffer = offer.isPendingOffer || offer.state === "pending";

                  return (
                    <JobCard
                      key={offer.id}
                      id={offer.id}
                      fuelType={order.fuel_types?.label || "Fuel"}
                      litres={parseFloat(order.litres)}
                      pickupLocation="Depot"
                      dropLocation={deliveryAddress}
                      distance={0}
                      earnings={order.total_cents / 100}
                      expiresIn={expiresInSeconds}
                      isPremium={false}
                      onAccept={() => handleAccept(offer.id)}
                      onReject={() => handleReject(offer.id)}
                    />
                  );
                })}
              </div>
            )}
          </TabsContent>

          <TabsContent value="assigned" className="space-y-3 sm:space-y-4">
            {/* GPS Location Tracker - Only active when on delivery */}
            <DriverLocationTracker 
              isOnDelivery={driverProfile?.availability_status === "on_delivery"}
              activeOrderId={assignedOrders.find((o: any) => o.state === "en_route")?.id || null}
            />
            
            {loadingAssigned ? (
              <div className="text-center py-8 sm:py-12 text-muted-foreground">
                <p>Loading assigned orders...</p>
              </div>
            ) : assignedOrders.length === 0 ? (
              <div className="text-center py-8 sm:py-12 text-muted-foreground">
                <p>No assigned jobs yet</p>
                <p className="text-sm mt-2">Accepted deliveries will appear here</p>
              </div>
            ) : (
              <div className="space-y-4">
                {assignedOrders.map((order) => {
                  const isStarting =
                    startDeliveryMutation.isPending &&
                    startDeliveryMutation.variables === order.id;
                  const isPickingUp =
                    pickupDeliveryMutation.isPending &&
                    pickupDeliveryMutation.variables === order.id;

                  return (
                    <Card key={order.id} data-testid={`card-assigned-order-${order.id}`}>
                    <CardHeader>
                      <CardTitle className="flex items-center justify-between">
                        <span className="text-base">
                          {order.fuel_types?.label || "Fuel"} - {parseFloat(order.litres)}L
                        </span>
                        <StatusBadge status={order.state} />
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="flex flex-wrap gap-2">
                        {order.state === "assigned" && (
                          <Button
                            onClick={() => handleStartDelivery(order.id)}
                            disabled={isStarting}
                            variant="outline"
                          >
                            {isStarting ? "Starting..." : "Start Delivery"}
                          </Button>
                        )}
                        {order.state === "en_route" && (
                          <Button
                            onClick={() => handlePickupDelivery(order.id)}
                            disabled={isPickingUp}
                            variant="secondary"
                          >
                            {isPickingUp ? "Updating..." : "Mark Picked Up"}
                          </Button>
                        )}
                        {["en_route", "picked_up"].includes(order.state) && (
                          <Button
                            onClick={() => handleCompleteDelivery(order)}
                            variant="default"
                          >
                            Complete Delivery
                          </Button>
                        )}
                      </div>

                      <div className="grid grid-cols-2 gap-3 text-sm">
                        <div>
                          <p className="text-muted-foreground">Customer</p>
                          <p className="font-medium">
                            {order.customers?.profiles?.full_name || 
                             order.customers?.company_name || 
                             "Customer"}
                          </p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">Amount</p>
                          <p className="font-medium">
                            {formatCurrencyAmount(order.total_cents / 100)}
                          </p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">Delivery Address</p>
                          <p className="font-medium text-xs">
                            {order.delivery_addresses?.address_street || 
                             `${order.drop_lat}, ${order.drop_lng}`}
                          </p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">Contact</p>
                          <p className="font-medium text-xs">
                            {order.customers?.profiles?.phone || "N/A"}
                          </p>
                        </div>
                      </div>

                      {/* Chat with customer */}
                      <OrderChat
                        orderId={order.id}
                        currentUserType="driver"
                      />
                    </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </TabsContent>

          <TabsContent value="vehicles" className="space-y-3 sm:space-y-4">
            <DriverVehicleManager />
          </TabsContent>

          <TabsContent value="pricing" className="space-y-3 sm:space-y-4">
            <DriverPricingManager />
          </TabsContent>

          <TabsContent value="settings" className="space-y-3 sm:space-y-4">
            <DriverPreferencesManager />
          </TabsContent>

          <TabsContent value="history" className="space-y-3 sm:space-y-4">
            {loadingCompleted ? (
              <div className="text-center py-8 sm:py-12 text-muted-foreground">
                <p>Loading completed jobs...</p>
              </div>
            ) : completedOrders.length === 0 ? (
              <div className="text-center py-8 sm:py-12 text-muted-foreground">
                <p>No completed jobs in the last week</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-4">
                {completedOrders.map((order) => {
                  const customerName = 
                    order.customers?.profiles?.full_name || 
                    order.customers?.company_name || 
                    "Customer";
                  
                  const fuelName = order.fuel_types?.label || "Fuel";
                  
                  const deliveryAddress = order.delivery_addresses
                    ? [
                        order.delivery_addresses.address_street,
                        order.delivery_addresses.address_city,
                        order.delivery_addresses.address_province
                      ].filter(Boolean).join(", ") || "Address not specified"
                    : order.drop_lat && order.drop_lng
                    ? `${order.drop_lat}, ${order.drop_lng}`
                    : "Address not specified";
                  
                  const earnings = order.total_cents ? order.total_cents / 100 : 0;
                  const deliveredDate = order.delivered_at 
                    ? new Date(order.delivered_at).toLocaleDateString("en-ZA", {
                        year: "numeric",
                        month: "short",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit"
                      })
                    : "Date not available";

                  return (
                    <Card key={order.id}>
                      <CardHeader>
                        <CardTitle className="flex items-center justify-between text-base">
                          <span>{fuelName} - {parseFloat(order.litres)}L</span>
                          <span className="text-sm font-normal text-muted-foreground">
                            {deliveredDate}
                          </span>
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                          <div>
                            <p className="text-muted-foreground">Customer</p>
                            <p className="font-medium">{customerName}</p>
                          </div>
                          <div>
                            <p className="text-muted-foreground">Earnings</p>
                            <p className="font-medium text-green-600 dark:text-green-400">
                              {formatCurrencyAmount(earnings)}
                            </p>
                          </div>
                          <div className="sm:col-span-2">
                            <p className="text-muted-foreground">Delivery Address</p>
                            <p className="font-medium text-xs sm:text-sm">{deliveryAddress}</p>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </TabsContent>
        </Tabs>

        {selectedOfferId && (
          <AcceptOfferDialog
            offerId={selectedOfferId}
            open={acceptDialogOpen}
            onOpenChange={(open) => {
              setAcceptDialogOpen(open);
              if (!open) setSelectedOfferId(null);
            }}
          />
        )}
        <CompleteDeliveryDialog
          order={orderToComplete}
          open={completeDialogOpen}
          onOpenChange={(open) => {
            setCompleteDialogOpen(open);
            if (!open) {
              setOrderToComplete(null);
            }
          }}
        />
      </main>
    </div>
  );
}
