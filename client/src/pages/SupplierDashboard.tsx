import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { AppHeader } from "@/components/AppHeader";
import { DepotCard } from "@/components/DepotCard";
import { StatsCard } from "@/components/StatsCard";
import { SupplierPricingManager } from "@/components/SupplierPricingManagerTiered";
import { DepotManagementDialog } from "@/components/DepotManagementDialog";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, MapPin, TrendingUp, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { formatCurrency } from "@/lib/utils";
import { useWebSocket } from "@/hooks/useWebSocket";
import { DriverDepotOrdersView } from "@/components/DriverDepotOrdersView";

export default function SupplierDashboard() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [depotDialogOpen, setDepotDialogOpen] = useState(false);
  const [selectedDepot, setSelectedDepot] = useState<any>(null);

  const { data: depots, isLoading: depotsLoading, error: depotsError } = useQuery<any[]>({
    queryKey: ["/api/supplier/depots"],
    refetchInterval: 5000, // Poll every 5 seconds for real-time updates
    staleTime: 0,
    retry: 2,
    retryDelay: 1000,
  });


  // Listen for real-time updates via WebSocket
  useWebSocket((message) => {
    console.log("[SupplierDashboard] WebSocket message received:", message.type, message);
    
    if (message.type === "depot_created" || message.type === "depot_updated" || message.type === "depot_deleted" || message.type === "pricing_updated") {
      // Refresh depots when depot or pricing changes
      console.log("[SupplierDashboard] Invalidating depots due to:", message.type);
      queryClient.invalidateQueries({ queryKey: ["/api/supplier/depots"] });
    }
  });

  const deleteDepotMutation = useMutation({
    mutationFn: async (depotId: string) => {
      return apiRequest("DELETE", `/api/supplier/depots/${depotId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/supplier/depots"] });
      toast({
        title: "Success",
        description: "Depot deleted successfully",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleEditDepot = (depot: any) => {
    setSelectedDepot(depot);
    setDepotDialogOpen(true);
  };

  const handleDeleteDepot = (depotId: string) => {
    if (confirm("Are you sure you want to delete this depot?")) {
      deleteDepotMutation.mutate(depotId);
    }
  };

  const handleAddDepot = () => {
    setSelectedDepot(null);
    setDepotDialogOpen(true);
  };

  const activeDepots = (depots || []).filter((depot: any) => depot.is_active !== false);

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold">My Depots</h1>
            <p className="text-muted-foreground">
              Manage your fuel supply locations
            </p>
          </div>
          <Button onClick={handleAddDepot} data-testid="button-add-depot">
            <Plus className="h-4 w-4 mr-2" />
            Add Depot
          </Button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
          <StatsCard
            title="Active Depots"
            value={activeDepots.length.toString()}
            icon={MapPin}
          />
          <StatsCard
            title="Total Depots"
            value={depots?.length?.toString() || "0"}
            description="Including inactive"
            icon={TrendingUp}
          />
        </div>

        <Tabs defaultValue="driver-orders" className="space-y-6">
          <div className="overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0">
            <TabsList className="min-w-max">
              <TabsTrigger value="driver-orders" data-testid="tab-driver-orders">
                Driver Orders
              </TabsTrigger>
              <TabsTrigger value="depots" data-testid="tab-depots">
                Depots
              </TabsTrigger>
              <TabsTrigger value="pricing" data-testid="tab-pricing">
                Pricing
              </TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="driver-orders" className="space-y-4">
            <DriverDepotOrdersView />
          </TabsContent>

          <TabsContent value="depots" className="space-y-4">
            {depotsError ? (
              <div className="text-center py-12 text-destructive">
                <p>Error loading depots: {depotsError instanceof Error ? depotsError.message : "Unknown error"}</p>
                <Button 
                  onClick={() => queryClient.invalidateQueries({ queryKey: ["/api/supplier/depots"] })}
                  className="mt-4"
                >
                  Retry
                </Button>
              </div>
            ) : depotsLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : depots && depots.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {depots.map((depot: any) => (
                  <DepotCard
                    key={depot.id}
                    id={depot.id}
                    name={depot.name}
                    location={`${depot.address_city || ''}, ${depot.address_province || ''}`.trim().replace(/^,\s*/, '') || 'No address'}
                    coordinates={{ lat: depot.lat, lng: depot.lng }}
                    openHours={typeof depot.open_hours === 'object' && depot.open_hours !== null
                      ? Object.entries(depot.open_hours)
                          .map(([day, hours]) => `${day}: ${hours}`)
                          .join(', ')
                      : 'Hours not set'}
                    fuelPrices={(() => {
                      // Group depot_prices by fuel_type_id to show tiers together
                      const pricesByFuelType = (depot.depot_prices || []).reduce((acc: any, dp: any) => {
                        const fuelTypeId = dp.fuel_type_id;
                        const fuelTypeLabel = dp.fuel_types?.label || 'Unknown';
                        
                        if (!acc[fuelTypeId]) {
                          acc[fuelTypeId] = {
                            type: fuelTypeLabel,
                            pricePerLitre: dp.price_cents / 100, // Keep for backward compatibility
                            tiers: [],
                          };
                        }
                        
                        // Add tier information
                        acc[fuelTypeId].tiers.push({
                          id: dp.id,
                          type: fuelTypeLabel,
                          pricePerLitre: dp.price_cents / 100,
                          minLitres: Number(dp.min_litres) || 0,
                        });
                        
                        return acc;
                      }, {});
                      
                      // Convert to array and sort tiers within each fuel type (matching driver portal logic)
                      return Object.values(pricesByFuelType).map((fuel: any) => ({
                        ...fuel,
                        tiers: fuel.tiers.sort((a: any, b: any) => {
                          const aMin = parseFloat(a.minLitres?.toString() || "0");
                          const bMin = parseFloat(b.minLitres?.toString() || "0");
                          return aMin - bMin;
                        }),
                      }));
                    })()}
                    isActive={depot.is_active !== false}
                    onEdit={() => handleEditDepot(depot)}
                    onDelete={() => handleDeleteDepot(depot.id)}
                  />
                ))}
              </div>
            ) : (
              <div className="text-center py-12 text-muted-foreground">
                <MapPin className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>No depots yet</p>
                <p className="text-sm mt-2">
                  Click "Add Depot" to create your first depot
                </p>
              </div>
            )}
          </TabsContent>

          <TabsContent value="pricing" className="space-y-4">
            <SupplierPricingManager />
          </TabsContent>
        </Tabs>
      </main>

      <DepotManagementDialog
        open={depotDialogOpen}
        onOpenChange={setDepotDialogOpen}
        depot={selectedDepot}
      />
    </div>
  );
}
