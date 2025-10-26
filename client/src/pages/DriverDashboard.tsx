import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { AppHeader } from "@/components/AppHeader";
import { JobCard } from "@/components/JobCard";
import { StatsCard } from "@/components/StatsCard";
import { DollarSign, TrendingUp, CheckCircle } from "lucide-react";
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
    <div className="min-h-screen bg-background">
      <AppHeader notificationCount={3} />
      
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2">Driver Dashboard</h1>
          <p className="text-muted-foreground">Manage your deliveries and earnings</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          <StatsCard
            title="Today's Earnings"
            value="R 1,240"
            icon={DollarSign}
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

        <Tabs defaultValue="available" className="space-y-6">
          <TabsList>
            <TabsTrigger value="available" data-testid="tab-available">Available Jobs</TabsTrigger>
            <TabsTrigger value="assigned" data-testid="tab-assigned">My Jobs</TabsTrigger>
            <TabsTrigger value="history" data-testid="tab-history">History</TabsTrigger>
          </TabsList>

          <TabsContent value="available" className="space-y-4">
            {isLoading ? (
              <div className="text-center py-8 text-muted-foreground">Loading offers...</div>
            ) : offers.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <p>No available offers at the moment</p>
                <p className="text-sm mt-2">New delivery requests will appear here</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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

          <TabsContent value="assigned" className="space-y-4">
            <div className="text-center py-12 text-muted-foreground">
              <p>No assigned jobs yet</p>
            </div>
          </TabsContent>

          <TabsContent value="history" className="space-y-4">
            <div className="text-center py-12 text-muted-foreground">
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
