import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { AppHeader } from "@/components/AppHeader";
import { DepotCard } from "@/components/DepotCard";
import { StatsCard } from "@/components/StatsCard";
import { SupplierPricingManager } from "@/components/SupplierPricingManagerTiered";
import { DepotManagementDialog } from "@/components/DepotManagementDialog";
import { Button } from "@/components/ui/button";
import { Plus, MapPin, TrendingUp, Loader2, ShoppingCart, BarChart3, Wallet, FileText, User, ExternalLink, DollarSign, CreditCard, Menu } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { formatCurrency } from "@/lib/utils";
import { useWebSocket } from "@/hooks/useWebSocket";
import { DriverDepotOrdersView } from "@/components/DriverDepotOrdersView";
import { SupplierAnalyticsTab } from "@/components/SupplierAnalyticsTab";
import { SupplierSettlementsTab } from "@/components/SupplierSettlementsTab";
import { SupplierInvoicesTab } from "@/components/SupplierInvoicesTab";
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
import { useLocation, Link } from "wouter";
import { useAuth } from "@/contexts/AuthContext";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

type SupplierTab = "driver-orders" | "depots" | "pricing" | "analytics" | "settlements" | "invoices";

export default function SupplierDashboard() {
  const { profile } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [location, setLocation] = useLocation();
  const [depotDialogOpen, setDepotDialogOpen] = useState(false);
  const [selectedDepot, setSelectedDepot] = useState<any>(null);
  const [activeTab, setActiveTab] = useState<SupplierTab>("driver-orders");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [orderStatusFilter, setOrderStatusFilter] = useState<string[] | null>(null);
  const [depotStatusFilter, setDepotStatusFilter] = useState<"all" | "active" | null>(null);
  const [kycWarningDialogOpen, setKycWarningDialogOpen] = useState(false);

  // Fetch supplier profile to check KYC status
  const { data: supplierProfile, refetch: refetchProfile } = useQuery<any>({
    queryKey: ["/api/supplier/profile"],
    enabled: !!profile && profile.role === "supplier", // Only fetch if supplier is logged in
    refetchInterval: 30000, // Poll every 30 seconds (WebSocket handles real-time)
    staleTime: 15 * 1000, // Consider data fresh for 15 seconds
    retry: false, // Don't retry on errors
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

  const { data: depotsData, isLoading: depotsLoading, error: depotsError } = useQuery<any[]>({
    queryKey: ["/api/supplier/depots"],
    enabled: !!profile && profile.role === "supplier", // Only fetch if supplier is logged in
    refetchInterval: 30000, // Poll every 30 seconds (WebSocket handles real-time)
    staleTime: 15 * 1000, // Consider data fresh for 15 seconds
    retry: false, // Don't retry on errors (including 403 compliance errors)
  });

  // Fetch driver depot orders (API returns { orders, depots, summaryByDepot } or array)
  const { data: ordersData } = useQuery<any>({
    queryKey: ["/api/supplier/driver-depot-orders"],
    enabled: !!profile && profile.role === "supplier",
    refetchInterval: 60000,
    staleTime: 30 * 1000,
    retry: false,
  });

  // Fetch subscription for banner and plan display
  const { data: subscriptionData } = useQuery<{ subscription: any; subscriptionTier: string | null }>({
    queryKey: ["/api/supplier/subscription"],
    enabled: !!profile && profile.role === "supplier",
    retry: false,
  });

  // Ensure arrays; API may return { orders, depots, summaryByDepot }
  const depots = depotsData || [];
  const orders = Array.isArray(ordersData) ? ordersData : (ordersData?.orders ?? []);
  const hasActiveSubscription = !!subscriptionData?.subscriptionTier && (subscriptionData?.subscription?.isActive ?? subscriptionData?.subscription?.status === "active");


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
    // Check if KYC/KYB is approved
    // Suppliers need: status === "active" AND compliance_status === "approved"
    // Also check kyb_status if available
    const isKYCApproved = 
      supplierProfile?.status === "active" && 
      supplierProfile?.compliance_status === "approved" &&
      (supplierProfile?.kyb_status === "approved" || supplierProfile?.kyb_status === undefined);
    
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

  const navItems: { value: SupplierTab; label: string; icon: typeof MapPin }[] = [
    { value: "driver-orders", label: "Driver Orders", icon: ShoppingCart },
    { value: "depots", label: "Depots", icon: MapPin },
    { value: "pricing", label: "Pricing", icon: DollarSign },
    { value: "analytics", label: "Analytics", icon: BarChart3 },
    { value: "settlements", label: "Settlements", icon: Wallet },
    { value: "invoices", label: "Invoices", icon: FileText },
  ];

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <AppHeader />

      <div className="flex flex-1 min-h-0">
        <aside className="hidden md:flex flex-col w-52 min-w-[208px] shrink-0 border-r border-border bg-muted/30 min-h-0 z-10" aria-label="Supplier navigation">
          <nav className="sticky top-0 flex flex-col p-3 gap-0.5 overflow-y-auto">
            <div className="px-3 py-2 mb-1">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Menu</p>
            </div>
            {navItems.map(({ value, label, icon: Icon }) => (
              <button
                key={value}
                onClick={() => setActiveTab(value)}
                className={cn(
                  "w-full flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors text-left",
                  activeTab === value ? "bg-primary/12 text-primary" : "text-muted-foreground hover:bg-muted hover:text-foreground"
                )}
                data-testid={`tab-${value}`}
              >
                <Icon className="h-5 w-5 shrink-0" />
                {label}
              </button>
            ))}
            <Link
              href="/supplier/subscription"
              className="w-full flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <CreditCard className="h-5 w-5 shrink-0" />
              Billing
            </Link>
          </nav>
        </aside>

        <Button variant="outline" size="icon" className="md:hidden fixed bottom-4 right-4 z-40 rounded-full shadow-lg" onClick={() => setSidebarOpen(true)} aria-label="Open menu">
          <Menu className="h-5 w-5" />
        </Button>

        <Sheet open={sidebarOpen} onOpenChange={setSidebarOpen}>
          <SheetContent side="left" className="w-72 p-0">
            <nav className="flex flex-col h-full py-4">
              <div className="px-4 pb-2">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Menu</p>
              </div>
              <div className="flex-1 overflow-y-auto space-y-1 px-2">
                {navItems.map(({ value, label, icon: Icon }) => (
                  <button key={value} onClick={() => { setActiveTab(value); setSidebarOpen(false); }} className={cn("w-full flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors text-left", activeTab === value ? "bg-primary/12 text-primary" : "text-muted-foreground hover:bg-muted hover:text-foreground")}>
                    <Icon className="h-5 w-5 shrink-0" /> {label}
                  </button>
                ))}
                <Link href="/supplier/subscription" onClick={() => setSidebarOpen(false)} className="w-full flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground">
                  <CreditCard className="h-5 w-5 shrink-0" /> Billing
                </Link>
              </div>
            </nav>
          </SheetContent>
        </Sheet>

        <main className="flex-1 min-w-0 overflow-auto">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {!hasActiveSubscription && (
          <div className="mb-6 p-4 rounded-lg border border-amber-500/50 bg-amber-500/10 flex items-center justify-between flex-wrap gap-4">
            <p className="text-amber-800 dark:text-amber-200 font-medium">
              Subscribe to list on the platform and receive driver depot orders.
            </p>
            <Button asChild variant="default" size="sm">
              <Link href="/supplier/subscription">
                <ExternalLink className="h-4 w-4 mr-2" />
                View plans
              </Link>
            </Button>
          </div>
        )}

        {hasActiveSubscription && subscriptionData?.subscriptionTier && (
          <div className="mb-4 text-sm text-muted-foreground flex items-center gap-2">
            <Badge variant="secondary">{subscriptionData.subscriptionTier === "enterprise" ? "Enterprise" : "Standard"}</Badge>
            <Link href="/supplier/subscription" className="text-primary hover:underline">Manage subscription</Link>
          </div>
        )}

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

        {supplierProfile?.subscription_tier === "enterprise" && supplierProfile?.accountManager && (
          <div className="mb-6 p-4 rounded-lg border bg-muted/50 flex items-center gap-4">
            <User className="h-10 w-10 text-muted-foreground" />
            <div>
              <p className="font-medium">Your account manager</p>
              <p className="text-sm text-muted-foreground">
                {supplierProfile.accountManager.name}
                {supplierProfile.accountManager.email ? ` • ${supplierProfile.accountManager.email}` : ""}
              </p>
            </div>
          </div>
        )}

        <div className="space-y-6">
          {activeTab === "driver-orders" && (
            <div className="space-y-4">
              <DriverDepotOrdersView statusFilter={orderStatusFilter} />
            </div>
          )}

          {activeTab === "depots" && (
            <div className="space-y-4">
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
                    onClick={handleAddDepot}
                    variant="outline"
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    Add Depot
                  </Button>
                </div>
              );
            })()}
            </div>
          )}

          {activeTab === "pricing" && (
            <div className="space-y-4">
              <SupplierPricingManager />
            </div>
          )}

          {activeTab === "analytics" && (
            <div className="space-y-4">
              <SupplierAnalyticsTab hasSubscription={hasActiveSubscription} />
            </div>
          )}

          {activeTab === "settlements" && (
            <div className="space-y-4">
              <SupplierSettlementsTab hasSubscription={hasActiveSubscription} />
            </div>
          )}

          {activeTab === "invoices" && (
            <div className="space-y-4">
              <SupplierInvoicesTab hasSubscription={hasActiveSubscription} />
            </div>
          )}
        </div>
          </div>
        </main>
      </div>

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
