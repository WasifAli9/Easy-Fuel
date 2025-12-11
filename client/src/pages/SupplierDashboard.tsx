import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { AppHeader } from "@/components/AppHeader";
import { DepotCard } from "@/components/DepotCard";
import { StatsCard } from "@/components/StatsCard";
import { SupplierPricingManager } from "@/components/SupplierPricingManagerTiered";
import { DepotManagementDialog } from "@/components/DepotManagementDialog";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, MapPin, TrendingUp, Loader2, ShoppingCart } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { formatCurrency } from "@/lib/utils";
import { useWebSocket } from "@/hooks/useWebSocket";
import { DriverDepotOrdersView } from "@/components/DriverDepotOrdersView";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/StatusBadge";
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
import { useLocation } from "wouter";

export default function SupplierDashboard() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [location, setLocation] = useLocation();
  const [depotDialogOpen, setDepotDialogOpen] = useState(false);
  const [selectedDepot, setSelectedDepot] = useState<any>(null);
  const [activeTab, setActiveTab] = useState<string>("driver-orders");
  const [orderStatusFilter, setOrderStatusFilter] = useState<string[] | null>(null);
  const [depotStatusFilter, setDepotStatusFilter] = useState<"all" | "active" | null>(null);
  const [kycWarningDialogOpen, setKycWarningDialogOpen] = useState(false);

  // Fetch supplier profile to check KYC status
  const { data: supplierProfile, refetch: refetchProfile } = useQuery<any>({
    queryKey: ["/api/supplier/profile"],
    refetchInterval: 5000, // Poll every 5 seconds
    staleTime: 0,
    gcTime: 0, // Don't cache, always fetch fresh data
  });

  // Debug: Log supplier profile status
  useEffect(() => {
    if (supplierProfile) {
      console.log("[SupplierDashboard] Supplier Profile Status:", {
        status: supplierProfile.status,
        compliance_status: supplierProfile.compliance_status,
        kyb_status: supplierProfile.kyb_status,
        isActive: supplierProfile.status === "active" && supplierProfile.compliance_status === "approved",
        fullProfile: supplierProfile
      });
    }
  }, [supplierProfile]);

  const { data: depots, isLoading: depotsLoading, error: depotsError } = useQuery<any[]>({
    queryKey: ["/api/supplier/depots"],
    refetchInterval: 5000, // Poll every 5 seconds for real-time updates
    staleTime: 0,
    retry: (failureCount, error: any) => {
      // Don't retry on 403 errors (compliance not approved)
      if (error?.status === 403 || error?.response?.status === 403) {
        return false;
      }
      return failureCount < 2;
    },
    retryDelay: 1000,
    // Return empty array on error instead of throwing
    select: (data) => data || [],
  });

  // Fetch driver depot orders to count active orders
  const { data: orders } = useQuery<any[]>({
    queryKey: ["/api/supplier/driver-depot-orders"],
    refetchInterval: 10000, // Refresh every 10 seconds
  });


  // Listen for real-time updates via WebSocket
  useWebSocket((message) => {
    console.log("[SupplierDashboard] WebSocket message received:", message.type, message);
    
    // Handle KYC/compliance approval
    if (message.type === "kyc_approved" || message.type === "compliance_approved" || message.type === "kyb_approved") {
      console.log("[SupplierDashboard] KYC/KYB approved, refreshing profile");
      queryClient.invalidateQueries({ queryKey: ["/api/supplier/profile"], exact: false });
      refetchProfile();
    }
    
    if (message.type === "depot_created" || message.type === "depot_updated" || message.type === "depot_deleted" || message.type === "pricing_updated") {
      // Refresh depots when depot or pricing changes
      console.log("[SupplierDashboard] Invalidating depots due to:", message.type);
      queryClient.invalidateQueries({ queryKey: ["/api/supplier/depots"] });
    }
    
    if (message.type === "driver_depot_order_placed" || message.type === "driver_depot_order_confirmed" || message.type === "driver_depot_order_fulfilled" || message.type === "driver_depot_order_cancelled") {
      // Refresh orders when order status changes
      console.log("[SupplierDashboard] Invalidating orders due to:", message.type);
      queryClient.invalidateQueries({ queryKey: ["/api/supplier/driver-depot-orders"] });
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
    // Check if KYC is approved
    const isKYCApproved = supplierProfile?.status === "active" && supplierProfile?.compliance_status === "approved";
    
    if (!isKYCApproved) {
      // Show warning dialog
      setKycWarningDialogOpen(true);
      return;
    }
    
    setSelectedDepot(null);
    setDepotDialogOpen(true);
  };

  const handleGoToProfile = () => {
    setKycWarningDialogOpen(false);
    setLocation("/supplier/profile");
  };

  const activeDepots = (depots || []).filter((depot: any) => depot.is_active !== false);
  
  // Count active orders (pending or confirmed status)
  const activeOrders = (orders || []).filter(
    (order: any) => order.status === "pending" || order.status === "confirmed"
  ).length;

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-4">
            <div>
              <div className="flex items-center gap-3">
                <h1 className="text-3xl font-bold">My Depots</h1>
                {supplierProfile && (
                  <Badge
                    variant={supplierProfile.status === "active" && supplierProfile.compliance_status === "approved" ? "default" : "secondary"}
                    className="text-sm px-3 py-1"
                  >
                    {supplierProfile.status === "active" && supplierProfile.compliance_status === "approved" ? "Active" : "Inactive"}
                  </Badge>
                )}
              </div>
              <p className="text-muted-foreground">
                Manage your fuel supply locations
              </p>
            </div>
          </div>
          <Button onClick={handleAddDepot} data-testid="button-add-depot">
            <Plus className="h-4 w-4 mr-2" />
            Add Depot
          </Button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          <StatsCard
            title="Active Depots"
            value={activeDepots.length.toString()}
            icon={MapPin}
            onClick={() => {
              setActiveTab("depots");
              setDepotStatusFilter("active");
              setOrderStatusFilter(null);
            }}
          />
          <StatsCard
            title="Total Depots"
            value={depots?.length?.toString() || "0"}
            description="Including inactive"
            icon={TrendingUp}
            onClick={() => {
              setActiveTab("depots");
              setDepotStatusFilter("all");
              setOrderStatusFilter(null);
            }}
          />
          <StatsCard
            title="Active Orders"
            value={activeOrders.toString()}
            icon={ShoppingCart}
            onClick={() => {
              setActiveTab("driver-orders");
              setOrderStatusFilter(["pending", "confirmed"]);
              setDepotStatusFilter(null);
            }}
          />
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
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
            <DriverDepotOrdersView statusFilter={orderStatusFilter} />
          </TabsContent>

          <TabsContent value="depots" className="space-y-4">
            {depotsError ? (
              <div className="text-center py-12">
                <div className="bg-yellow-50 dark:bg-yellow-950/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-6 max-w-md mx-auto">
                  <p className="text-yellow-800 dark:text-yellow-200 font-medium mb-2">
                    Compliance Review Required
                  </p>
                  <p className="text-sm text-yellow-700 dark:text-yellow-300 mb-4">
                    Your compliance documents must be approved before you can manage depots. Please complete your compliance profile and wait for admin approval.
                  </p>
                  <Button 
                    onClick={() => queryClient.invalidateQueries({ queryKey: ["/api/supplier/depots"] })}
                    variant="outline"
                    size="sm"
                  >
                    Retry
                  </Button>
                </div>
              </div>
            ) : depotsLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : (() => {
              // Filter depots based on depotStatusFilter
              let filteredDepots = depots || [];
              if (depotStatusFilter === "active") {
                filteredDepots = filteredDepots.filter((depot: any) => depot.is_active !== false);
              }
              // If depotStatusFilter is "all" or null, show all depots
              
              return filteredDepots.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {filteredDepots.map((depot: any) => (
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
                  <p className="text-lg font-medium mb-2">{depotStatusFilter === "active" ? "No active depots" : "No depots yet"}</p>
                  <p className="text-sm mb-4">
                    {depotStatusFilter === "active" 
                      ? "Activate a depot to see it here"
                      : "Click \"Add Depot\" to create your first depot"}
                  </p>
                  <Button 
                    onClick={() => setDepotDialogOpen(true)}
                    variant="outline"
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    Add Depot
                  </Button>
                </div>
              );
            })()}
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

      {/* KYC Warning Dialog */}
      <AlertDialog open={kycWarningDialogOpen} onOpenChange={setKycWarningDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>KYC Approval Required</AlertDialogTitle>
            <AlertDialogDescription>
              Please apply for KYC from profile management and wait for approval before adding depots.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleGoToProfile}>
              Go to Profile
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
