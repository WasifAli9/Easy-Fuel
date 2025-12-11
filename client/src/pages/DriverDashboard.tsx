import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { AppHeader } from "@/components/AppHeader";
import { StatsCard } from "@/components/StatsCard";
import { DriverPricingManager } from "@/components/DriverPricingManager";
import { DriverVehicleManager } from "@/components/DriverVehicleManager";
import { DriverPreferencesManager } from "@/components/DriverPreferencesManager";
import { DriverLocationTracker } from "@/components/DriverLocationTracker";
import { OrderChat } from "@/components/OrderChat";
import { DriverDepotsView } from "@/components/DriverDepotsView";
import { Wallet, TrendingUp, CheckCircle, User, MapPin, Phone, DollarSign, Package, Truck, CheckCircle2, XCircle, AlertCircle, ArrowRight } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/StatusBadge";
import { useCurrency } from "@/hooks/use-currency";
import { formatCurrency } from "@/lib/utils";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useLocation } from "wouter";
import { CompleteDeliveryDialog } from "@/components/CompleteDeliveryDialog";
import { useWebSocket } from "@/hooks/useWebSocket";
import { useAuth } from "@/contexts/AuthContext";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export default function DriverDashboard() {
  // No longer needed - drivers don't dismiss offers
  const [orderToComplete, setOrderToComplete] = useState<any | null>(null);
  const [completeDialogOpen, setCompleteDialogOpen] = useState(false);
  const [locationPermissionDialogOpen, setLocationPermissionDialogOpen] = useState(false);
  const { toast } = useToast();
  const { profile } = useAuth();

  // Request location permission when driver logs in
  useEffect(() => {
    if (profile?.role === "driver" && navigator.geolocation) {
      // Check if permission was already granted or denied
      navigator.permissions?.query({ name: "geolocation" }).then((result) => {
        if (result.state === "prompt") {
          // Permission not yet requested, show dialog
          setLocationPermissionDialogOpen(true);
        } else if (result.state === "denied") {
          // Permission was denied, show toast
          toast({
            title: "Location Access Required",
            description: "Please enable location access in your browser settings to track your location.",
            variant: "destructive",
          });
        }
        // If granted, do nothing (location tracking will start automatically)
      }).catch(() => {
        // Permissions API not supported, try to request directly
        setLocationPermissionDialogOpen(true);
      });
    }
  }, [profile?.role, toast]);

  const handleRequestLocationPermission = async () => {
    setLocationPermissionDialogOpen(false);

    if (!navigator.geolocation) {
      toast({
        title: "Geolocation Not Supported",
        description: "Your browser does not support geolocation.",
        variant: "destructive",
      });
      return;
    }

    try {
      // Request location permission by trying to get current position
      await new Promise<void>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(
          () => {
            toast({
              title: "Location Access Granted",
              description: "Your location will be tracked automatically.",
            });
            resolve();
          },
          (error) => {
            if (error.code === error.PERMISSION_DENIED) {
              toast({
                title: "Location Access Denied",
                description: "Please enable location access in your browser settings to track your location.",
                variant: "destructive",
              });
            } else {
              toast({
                title: "Location Error",
                description: "Failed to get your location. Please check your browser settings.",
                variant: "destructive",
              });
            }
            reject(error);
          },
          { timeout: 5000 }
        );
      });
    } catch (error) {
      // Error already handled in toast
    }
  };

  // No longer fetching offers - drivers don't need to see available orders
  // Orders are automatically matched and appear in "My Jobs" when assigned

  // Fetch driver profile to check availability status
  const { data: driverProfile, refetch: refetchProfile } = useQuery<any>({
    queryKey: ["/api/driver/profile"],
    refetchInterval: 5000, // Poll every 5 seconds
    staleTime: 0,
    gcTime: 0, // Don't cache, always fetch fresh data (React Query v5)
  });

  // Debug: Log driver profile status
  useEffect(() => {
    if (driverProfile) {
      console.log("[DriverDashboard] Driver Profile Status:", {
        status: driverProfile.status,
        compliance_status: driverProfile.compliance_status,
        isActive: driverProfile.status === "active" && driverProfile.compliance_status === "approved",
        fullProfile: driverProfile
      });
    }
  }, [driverProfile]);

  // Fetch pricing to check if any pricing is set
  const { data: pricingData = [] } = useQuery<any[]>({
    queryKey: ["/api/driver/pricing"],
    retry: false,
  });

  // Fetch vehicles to check if any vehicle is added
  const { data: vehiclesData = [] } = useQuery<any[]>({
    queryKey: ["/api/driver/vehicles"],
    retry: false,
  });

  const [, setLocation] = useLocation();

  const { data: statsData, isLoading: statsLoading } = useQuery<{
    activeJobs: number;
    todayEarningsCents: number;
    completedThisWeek: number;
    totalEarningsCents: number;
    totalDeliveries: number;
  }>({
    queryKey: ["/api/driver/stats"],
    refetchInterval: 5000, // Poll every 5 seconds
    staleTime: 0,
  });

  // Fetch assigned orders (accepted deliveries)
  const { data: assignedOrders = [], isLoading: loadingAssigned } = useQuery<any[]>({
    queryKey: ["/api/driver/assigned-orders"],
    refetchInterval: 5000, // Poll every 5 seconds for real-time updates
    staleTime: 0,
  });

  // Fetch completed orders (last week)
  const { data: completedOrders = [], isLoading: loadingCompleted } = useQuery<any[]>({
    queryKey: ["/api/driver/completed-orders"],
    refetchInterval: 5000, // Poll every 5 seconds for real-time updates
    staleTime: 0,
  });

  const { currency } = useCurrency();

  // Set up WebSocket to refresh data when changes occur
  useWebSocket((message) => {
    console.log("[DriverDashboard] WebSocket message received:", message.type, message);

    // Handle KYC/compliance approval
    if (message.type === "kyc_approved" || message.type === "compliance_approved") {
      console.log("[DriverDashboard] KYC/Compliance approved, refreshing profile and documents");
      // Force immediate refetch by invalidating and refetching
      queryClient.invalidateQueries({ queryKey: ["/api/driver/profile"], exact: false });
      queryClient.invalidateQueries({ queryKey: ["/api/driver/documents"], exact: false });
      // Force refetch immediately
      setTimeout(() => {
        refetchProfile();
        queryClient.refetchQueries({ queryKey: ["/api/driver/documents"], exact: false });
      }, 100);
    }

    const orderData = (message as any).order || (message as any).payload?.order;
    const orderId = (message as any).orderId || (message as any).payload?.orderId;

    if (message.type === "order_updated" && orderData) {
      // Directly update the query cache with new order data (like chat messages)
      console.log("[DriverDashboard] Updating order in cache:", orderId);

      // Update assigned orders list
      queryClient.setQueryData<any[]>(["/api/driver/assigned-orders"], (old = []) => {
        const exists = old.findIndex((o: any) => o.id === orderId);
        if (exists >= 0) {
          // Update existing order
          const updated = [...old];
          updated[exists] = orderData;
          return updated;
        } else if (["assigned", "en_route", "picked_up"].includes(orderData.state)) {
          // Add new order if it's in an active state
          return [orderData, ...old];
        }
        return old;
      });

      // Update completed orders if delivered
      if (orderData.state === "delivered") {
        queryClient.setQueryData<any[]>(["/api/driver/completed-orders"], (old = []) => {
          const exists = old.findIndex((o: any) => o.id === orderId);
          if (exists >= 0) {
            const updated = [...old];
            updated[exists] = orderData;
            return updated;
          } else {
            return [orderData, ...old];
          }
        });
      }

      // Invalidate stats to recalculate
      queryClient.invalidateQueries({ queryKey: ["/api/driver/stats"] });
    }

    if (message.type === "order_update" || message.type === "order_assigned" || message.type === "order_state_changed") {
      // Fallback: invalidate queries for other message types
      console.log("[DriverDashboard] Invalidating assigned orders due to:", message.type);
      queryClient.invalidateQueries({ queryKey: ["/api/driver/assigned-orders"] });
      queryClient.invalidateQueries({ queryKey: ["/api/driver/stats"] });
    }
  });

  // Helper function to format currency using the user's preferred currency
  const formatCurrencyAmount = (amount: number) => formatCurrency(amount, currency);

  const todayEarningsDisplay = statsLoading
    ? "..."
    : formatCurrencyAmount((statsData?.todayEarningsCents || 0) / 100);

  const activeJobsDisplay = statsLoading ? "..." : (statsData?.activeJobs || 0);
  const completedThisWeekDisplay = statsLoading ? "..." : (statsData?.completedThisWeek || 0);

  // No longer needed - drivers don't reject offers (offers are auto-created)

  const startDeliveryMutation = useMutation({
    mutationFn: async (orderId: string) => {
      const response = await apiRequest("POST", `/api/driver/orders/${orderId}/start`);
      return response.json();
    },
    onSuccess: async (_data, orderId) => {
      // Invalidate all related queries
      await queryClient.invalidateQueries({ queryKey: ["/api/driver/assigned-orders"] });
      await queryClient.invalidateQueries({ queryKey: ["/api/driver/stats"] });
      await queryClient.invalidateQueries({ queryKey: ["/api/driver/profile"] });
      await queryClient.invalidateQueries({ queryKey: ["/api/orders", orderId] });
      await queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
      await queryClient.invalidateQueries({ queryKey: ["/api/driver/offers"] });
      // Immediately refetch to show updated state
      await queryClient.refetchQueries({ queryKey: ["/api/driver/assigned-orders"] });
      await queryClient.refetchQueries({ queryKey: ["/api/orders", orderId] });
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
    onSuccess: async (_data, orderId) => {
      // Invalidate all related queries
      await queryClient.invalidateQueries({ queryKey: ["/api/driver/assigned-orders"] });
      await queryClient.invalidateQueries({ queryKey: ["/api/driver/stats"] });
      await queryClient.invalidateQueries({ queryKey: ["/api/orders", orderId] });
      await queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
      await queryClient.invalidateQueries({ queryKey: ["/api/orders", orderId, "offers"] });
      // Immediately refetch to show updated state
      await queryClient.refetchQueries({ queryKey: ["/api/driver/assigned-orders"] });
      await queryClient.refetchQueries({ queryKey: ["/api/orders", orderId] });
      await queryClient.refetchQueries({ queryKey: ["/api/orders"] });
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

  // No longer needed - drivers don't write offers

  return (
    <div className="min-h-screen bg-background pb-safe">
      <AppHeader />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-8">
        <div className="mb-4 sm:mb-8">
          <div className="flex items-center justify-between mb-1">
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold mb-1">Driver Dashboard</h1>
              <p className="text-sm text-muted-foreground">Manage your deliveries and earnings</p>
            </div>
            {driverProfile && (
              <Badge 
                variant={driverProfile.status === "active" && driverProfile.compliance_status === "approved" ? "default" : "secondary"}
                className="text-sm px-3 py-1"
              >
                {driverProfile.status === "active" && driverProfile.compliance_status === "approved" ? "Active" : "Inactive"}
              </Badge>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4 mb-4 sm:mb-8">
          <StatsCard
            title="Earnings This Week"
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

        <Tabs defaultValue="assigned" className="space-y-4 sm:space-y-6">
          <div className="overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0 scrollbar-hide">
            <div className="flex flex-col sm:flex-row sm:justify-between gap-4 min-w-max w-full">
              <TabsList className="min-w-max w-full sm:w-auto grid grid-cols-3 sm:grid-cols-5 sm:inline-flex">
                <TabsTrigger value="assigned" data-testid="tab-assigned" className="text-xs sm:text-sm">My Jobs</TabsTrigger>
                <TabsTrigger value="vehicles" data-testid="tab-vehicles" className="text-xs sm:text-sm">Vehicles</TabsTrigger>
                <TabsTrigger value="pricing" data-testid="tab-pricing" className="text-xs sm:text-sm">Pricing</TabsTrigger>
                <TabsTrigger value="settings" data-testid="tab-settings" className="text-xs sm:text-sm">Settings</TabsTrigger>
                <TabsTrigger value="history" data-testid="tab-history" className="text-xs sm:text-sm">History</TabsTrigger>
              </TabsList>

              <TabsList className="min-w-max w-full sm:w-auto grid grid-cols-2 sm:inline-flex">
                <TabsTrigger value="depot-orders" data-testid="tab-depot-orders" className="text-xs sm:text-sm">My Depot Orders</TabsTrigger>
                <TabsTrigger value="available-depots" data-testid="tab-available-depots" className="text-xs sm:text-sm">Available Depots</TabsTrigger>
              </TabsList>
            </div>
          </div>

          <TabsContent value="assigned" className="space-y-3 sm:space-y-4">
            {/* GPS Location Tracker - Always active for drivers to send live coordinates */}
            <DriverLocationTracker
              isOnDelivery={true} // Always track location when driver is logged in
              activeOrderId={assignedOrders.find((o: any) => o.state === "en_route" || o.state === "picked_up")?.id || null}
            />

            {/* Setup Requirements Alert */}
            {(() => {
              // Check all requirements
              const isKYCApproved = driverProfile?.status === "active" && driverProfile?.compliance_status === "approved";
              const hasPricing = pricingData && pricingData.length > 0 && pricingData.some((p: any) => p.pricing && p.pricing.active);
              const hasVehicle = vehiclesData && vehiclesData.length > 0;
              const hasCoordinates = driverProfile?.current_lat && driverProfile?.current_lng;

              const allComplete = isKYCApproved && hasPricing && hasVehicle && hasCoordinates;

              // Don't show if all requirements are met
              if (allComplete) return null;

              return (
                <Alert className="border-yellow-200 bg-yellow-50 dark:bg-yellow-950/20">
                  <AlertCircle className="h-4 w-4 text-yellow-600 dark:text-yellow-500" />
                  <AlertTitle className="text-yellow-900 dark:text-yellow-100">Setup Required</AlertTitle>
                  <AlertDescription className="text-yellow-800 dark:text-yellow-200 mt-2">
                    <p className="mb-3">Complete the following to start receiving orders:</p>
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        {isKYCApproved ? (
                          <CheckCircle2 className="h-4 w-4 text-green-600" />
                        ) : (
                          <XCircle className="h-4 w-4 text-yellow-600" />
                        )}
                        <span className={isKYCApproved ? "text-green-700 dark:text-green-300" : ""}>
                          KYC Approval (Complete compliance profile)
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        {hasPricing ? (
                          <CheckCircle2 className="h-4 w-4 text-green-600" />
                        ) : (
                          <XCircle className="h-4 w-4 text-yellow-600" />
                        )}
                        <span className={hasPricing ? "text-green-700 dark:text-green-300" : ""}>
                          Fuel Pricing (Set your fuel prices)
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        {hasVehicle ? (
                          <CheckCircle2 className="h-4 w-4 text-green-600" />
                        ) : (
                          <XCircle className="h-4 w-4 text-yellow-600" />
                        )}
                        <span className={hasVehicle ? "text-green-700 dark:text-green-300" : ""}>
                          Vehicle (Add at least one vehicle)
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        {hasCoordinates ? (
                          <CheckCircle2 className="h-4 w-4 text-green-600" />
                        ) : (
                          <XCircle className="h-4 w-4 text-yellow-600" />
                        )}
                        <span className={hasCoordinates ? "text-green-700 dark:text-green-300" : ""}>
                          Coordinates (Set your location in Settings)
                        </span>
                      </div>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      className="mt-4 border-yellow-300 text-yellow-900 hover:bg-yellow-100 dark:text-yellow-100 dark:border-yellow-800 dark:hover:bg-yellow-900/30"
                      onClick={() => setLocation("/driver/profile")}
                    >
                      Complete Setup
                      <ArrowRight className="h-3 w-3 ml-2" />
                    </Button>
                  </AlertDescription>
                </Alert>
              );
            })()}

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

                  const customerName = order.customers?.profiles?.full_name ||
                    order.customers?.company_name ||
                    "Customer";
                  const deliveryAddress = order.delivery_addresses
                    ? [
                        order.delivery_addresses.address_street,
                        order.delivery_addresses.address_city,
                        order.delivery_addresses.address_province
                      ].filter(Boolean).join(", ") || "Address not specified"
                    : order.drop_lat && order.drop_lng
                      ? `${order.drop_lat}, ${order.drop_lng}`
                      : "Address not specified";
                  const customerPhone = order.customers?.profiles?.phone || "N/A";

                  return (
                    <Card key={order.id} data-testid={`card-assigned-order-${order.id}`} className="overflow-hidden">
                      <CardHeader className="pb-3">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <div className="p-2 rounded-lg bg-primary/10">
                              <Package className="h-5 w-5 text-primary" />
                            </div>
                            <div>
                              <CardTitle className="text-lg">
                                {order.fuel_types?.label || "Fuel"} - {parseFloat(order.litres)}L
                              </CardTitle>
                              <p className="text-sm text-muted-foreground mt-0.5">
                                Order #{order.id.slice(-8)}
                              </p>
                            </div>
                          </div>
                          <StatusBadge status={order.state} />
                        </div>
                      </CardHeader>
                      <CardContent className="p-0">
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-0 border-t">
                          {/* Left Column - Order Details */}
                          <div className="p-6 space-y-6 border-r border-border/50">
                            {/* Action Buttons */}
                            <div className="flex flex-wrap gap-2">
                              {order.state === "assigned" && (
                                <Button
                                  onClick={() => handleStartDelivery(order.id)}
                                  disabled={isStarting}
                                  variant="default"
                                  className="flex items-center gap-2"
                                  size="sm"
                                >
                                  <Truck className="h-4 w-4" />
                                  {isStarting ? "Starting..." : "Start Delivery"}
                                </Button>
                              )}
                              {order.state === "en_route" && (
                                <Button
                                  onClick={() => handlePickupDelivery(order.id)}
                                  disabled={isPickingUp}
                                  variant="secondary"
                                  className="flex items-center gap-2"
                                  size="sm"
                                >
                                  <Package className="h-4 w-4" />
                                  {isPickingUp ? "Updating..." : "Mark Picked Up"}
                                </Button>
                              )}
                              {order.state === "picked_up" && (
                                <Button
                                  onClick={() => handleCompleteDelivery(order)}
                                  variant="default"
                                  className="flex items-center gap-2 bg-green-600 hover:bg-green-700"
                                  size="sm"
                                >
                                  <CheckCircle className="h-4 w-4" />
                                  Complete Delivery
                                </Button>
                              )}
                            </div>

                            {/* Order Details */}
                            <div className="space-y-4">
                              <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/50">
                                <div className="p-1.5 rounded-md bg-background">
                                  <User className="h-4 w-4 text-muted-foreground" />
                                </div>
                                <div className="flex-1 min-w-0">
                                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">
                                    Customer
                                  </p>
                                  <p className="font-semibold text-sm truncate">
                                    {customerName}
                                  </p>
                                </div>
                              </div>

                              <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/50">
                                <div className="p-1.5 rounded-md bg-background">
                                  <DollarSign className="h-4 w-4 text-muted-foreground" />
                                </div>
                                <div className="flex-1 min-w-0">
                                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">
                                    Amount
                                  </p>
                                  <p className="font-semibold text-base text-green-600 dark:text-green-400">
                                    {formatCurrencyAmount(order.total_cents / 100)}
                                  </p>
                                </div>
                              </div>

                              <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/50">
                                <div className="p-1.5 rounded-md bg-background">
                                  <MapPin className="h-4 w-4 text-muted-foreground" />
                                </div>
                                <div className="flex-1 min-w-0">
                                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">
                                    Delivery Address
                                  </p>
                                  <p className="font-medium text-sm leading-relaxed">
                                    {deliveryAddress}
                                  </p>
                                </div>
                              </div>

                              <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/50">
                                <div className="p-1.5 rounded-md bg-background">
                                  <Phone className="h-4 w-4 text-muted-foreground" />
                                </div>
                                <div className="flex-1 min-w-0">
                                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">
                                    Contact
                                  </p>
                                  <p className="font-medium text-sm">
                                    {customerPhone}
                                  </p>
                                </div>
                              </div>
                            </div>
                          </div>

                          {/* Right Column - Chat */}
                          <div className="p-6">
                            <OrderChat
                              orderId={order.id}
                              currentUserType="driver"
                            />
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </TabsContent>

          <TabsContent value="depot-orders" className="space-y-3 sm:space-y-4">
            <DriverDepotsView defaultTab="orders" />
          </TabsContent>

          <TabsContent value="available-depots" className="space-y-3 sm:space-y-4">
            <DriverDepotsView defaultTab="depots" />
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

        {/* Location Permission Dialog */}
        <AlertDialog open={locationPermissionDialogOpen} onOpenChange={setLocationPermissionDialogOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Enable Location Tracking</AlertDialogTitle>
              <AlertDialogDescription>
                To provide real-time location updates to customers, we need access to your location.
                Your location will be sent every 0.5 seconds when you're on a delivery.
                <br /><br />
                Please click "Allow" when your browser asks for location permission.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Not Now</AlertDialogCancel>
              <AlertDialogAction onClick={handleRequestLocationPermission}>
                Enable Location
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </main>
    </div>
  );
}
