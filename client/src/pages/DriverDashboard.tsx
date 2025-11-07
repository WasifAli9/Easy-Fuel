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
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/StatusBadge";
import { useCurrency } from "@/hooks/use-currency";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AcceptOfferDialog } from "@/components/AcceptOfferDialog";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";

export default function DriverDashboard() {
  const [selectedOfferId, setSelectedOfferId] = useState<string | null>(null);
  const [acceptDialogOpen, setAcceptDialogOpen] = useState(false);
  const { toast } = useToast();

  // Fetch available dispatch offers
  const { data: offers = [], isLoading } = useQuery<any[]>({
    queryKey: ["/api/driver/offers"],
    refetchInterval: 30000, // Refresh every 30 seconds
  });

  // Fetch driver profile to check availability status
  const { data: driverProfile } = useQuery<any>({
    queryKey: ["/api/driver/profile"],
  });

  // Fetch assigned orders (accepted deliveries)
  const { data: assignedOrders = [], isLoading: loadingAssigned } = useQuery<any[]>({
    queryKey: ["/api/driver/assigned-orders"],
    refetchInterval: 15000, // Refresh every 15 seconds
  });

  const { currencySymbol, formatCurrency } = useCurrency();

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

  const handleAccept = (offerId: string) => {
    setSelectedOfferId(offerId);
    setAcceptDialogOpen(true);
  };

  const handleReject = (offerId: string) => {
    if (confirm("Are you sure you want to reject this offer?")) {
      rejectOfferMutation.mutate(offerId);
    }
  };

  return (
    <div className="min-h-screen bg-background pb-safe">
      <AppHeader notificationCount={3} />
      
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-8">
        <div className="mb-4 sm:mb-8">
          <h1 className="text-2xl sm:text-3xl font-bold mb-1">Driver Dashboard</h1>
          <p className="text-sm text-muted-foreground">Manage your deliveries and earnings</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4 mb-4 sm:mb-8">
          <StatsCard
            title="Today's Earnings"
            value="R 1,240"
            icon={Wallet}
            trend={{ value: 15, isPositive: true }}
          />
          <StatsCard
            title="Active Jobs"
            value="2"
            description="In progress"
            icon={TrendingUp}
          />
          <StatsCard
            title="Completed"
            value="8"
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
            ) : offers.length === 0 ? (
              <div className="text-center py-8 sm:py-12 text-muted-foreground">
                <p>No available offers at the moment</p>
                <p className="text-sm mt-2">New delivery requests will appear here</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 sm:gap-4">
                {offers.map((offer) => {
                  const order = offer.orders;
                  const deliveryAddress = order.delivery_addresses 
                    ? `${order.delivery_addresses.address_street}, ${order.delivery_addresses.address_city}`
                    : `${order.drop_lat}, ${order.drop_lng}`;
                  
                  const expiresInSeconds = Math.floor(
                    (new Date(offer.expires_at).getTime() - Date.now()) / 1000
                  );

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
                {assignedOrders.map((order) => (
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
                            {formatCurrency(order.total_cents / 100)}
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
                ))}
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
            <div className="text-center py-8 sm:py-12 text-muted-foreground">
              <p>No completed jobs yet</p>
            </div>
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
      </main>
    </div>
  );
}
