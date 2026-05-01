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
import { Wallet, TrendingUp, CheckCircle, User, MapPin, Phone, DollarSign, Package, Truck, CheckCircle2, XCircle, AlertCircle, ArrowRight, CreditCard, Download, LayoutDashboard, Car, Settings, History, Warehouse, Store, Menu, Home, ClipboardList, MessageCircle } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/StatusBadge";
import { useCurrency } from "@/hooks/use-currency";
import { formatCurrency } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useLocation, Link } from "wouter";
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
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { normalizeDocuments } from "@/lib/document-normalize";
import { Separator } from "@/components/ui/separator";
import {
  DashboardSidebarAside,
  DashboardSidebarInner,
  DashboardNavSection,
  DashboardNavButton,
  DashboardNavLink,
  DashboardSidebarDivider,
} from "@/components/dashboard/DashboardSidebar";
import { AlertTriangle, Calendar, Shield, FileCheck, CalendarClock } from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";

type DriverTab = "overview" | "assigned" | "vehicles" | "pricing" | "settings" | "history" | "depot-orders" | "available-depots";

export default function DriverDashboard() {
  const [orderToComplete, setOrderToComplete] = useState<any | null>(null);
  const [completeDialogOpen, setCompleteDialogOpen] = useState(false);
  const [locationPermissionDialogOpen, setLocationPermissionDialogOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<DriverTab>("overview");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { toast } = useToast();
  const { profile, session, loading } = useAuth();

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
    enabled: !loading && !!session?.access_token && !!profile && profile.role === "driver",
    refetchInterval: 30000, // Poll every 30 seconds (WebSocket handles real-time)
    staleTime: 15 * 1000, // Consider data fresh for 15 seconds
    retry: false, // Don't retry on errors
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
  const { data: pricingDataRaw } = useQuery<any[]>({
    queryKey: ["/api/driver/pricing"],
    enabled: !loading && !!session?.access_token && !!profile && profile.role === "driver",
    retry: false, // Don't retry on errors
  });

  // Fetch vehicles to check if any vehicle is added
  const { data: vehiclesDataRaw } = useQuery<any[]>({
    queryKey: ["/api/driver/vehicles"],
    enabled: !loading && !!session?.access_token && !!profile && profile.role === "driver",
    retry: false, // Don't retry on errors
  });

  // Ensure arrays are always arrays (never null/undefined)
  const pricingData = pricingDataRaw || [];
  const vehiclesData = vehiclesDataRaw || [];

  const [, setLocation] = useLocation();

  const { data: statsData, isLoading: statsLoading } = useQuery<{
    activeJobs: number;
    todayEarningsCents: number;
    completedThisWeek: number;
    totalEarningsCents: number;
    totalDeliveries: number;
    earningsByWeek?: Record<string, number>;
    earningsByFuelType?: Record<string, number>;
    fuelCostByDelivery?: { id: string; deliveredAt: string; litres: number; fuelType: string; fuelCostCents: number; deliveryFeeCents: number }[];
    totalFuelCostCents?: number;
  }>({
    queryKey: ["/api/driver/stats"],
    enabled: !loading && !!session?.access_token && !!profile && profile.role === "driver",
    refetchInterval: 30000,
    staleTime: 15 * 1000,
    retry: false,
  });

  const { data: subscriptionData } = useQuery<{
    subscription: { planCode: string; plan?: { name: string }; nextBillingAt: string | null } | null;
    hasActiveSubscription: boolean;
  }>({
    queryKey: ["/api/driver/subscription"],
    enabled: !loading && !!session?.access_token && !!profile && profile.role === "driver",
  });

  const hasActiveSubscription = subscriptionData?.hasActiveSubscription ?? false;
  const subscription = subscriptionData?.subscription;
  const canExport = hasActiveSubscription && subscription?.planCode === "premium";
  const canAdvancedStats = hasActiveSubscription && (subscription?.planCode === "professional" || subscription?.planCode === "premium");

  const { data: statsAdvanced } = useQuery<typeof statsData>({
    queryKey: ["/api/driver/stats?detail=advanced"],
    enabled: !loading && !!session?.access_token && !!profile && profile.role === "driver" && !!canAdvancedStats,
    staleTime: 60 * 1000,
  });

  // Fetch assigned orders (accepted deliveries)
  const { data: assignedOrdersData, isLoading: loadingAssigned } = useQuery<any[]>({
    queryKey: ["/api/driver/assigned-orders"],
    enabled: !loading && !!session?.access_token && !!profile && profile.role === "driver",
    refetchInterval: 30000, // Poll every 30 seconds (WebSocket handles real-time)
    staleTime: 15 * 1000, // Consider data fresh for 15 seconds
    retry: false, // Don't retry on errors
  });

  // Fetch completed orders (last week)
  const { data: completedOrdersData, isLoading: loadingCompleted } = useQuery<any[]>({
    queryKey: ["/api/driver/completed-orders"],
    enabled: !loading && !!session?.access_token && !!profile && profile.role === "driver",
    refetchInterval: 30000, // Poll every 30 seconds (WebSocket handles real-time)
    staleTime: 15 * 1000, // Consider data fresh for 15 seconds
    retry: false, // Don't retry on errors
  });

  // Ensure arrays are always arrays (never null/undefined)
  const assignedOrders = assignedOrdersData || [];
  const completedOrders = completedOrdersData || [];

  // Fetch driver documents for Critical Alerts / Action Required / Upcoming Due (advanced dashboard)
  const { data: documentsData } = useQuery<{ id: string; doc_type: string; title?: string; expiry_date: string | null; verification_status?: string }[]>({
    queryKey: ["/api/driver/documents"],
    enabled: !loading && !!session?.access_token && !!profile && profile.role === "driver",
    retry: false,
  });
  const documents = normalizeDocuments(documentsData);

  const { currency } = useCurrency();

  // Tier: Starter = simpler dashboard; Professional and Premium = same advanced dashboard; Export = Premium only
  const isStarterDashboard = !hasActiveSubscription || subscription?.planCode === "starter";

  // Expiry helpers (7 and 30 days)
  const now = new Date();
  const in7 = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  const in30 = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  const docExpiringIn7 = documents.filter((d) => d.expiry_date && new Date(d.expiry_date) <= in7 && new Date(d.expiry_date) >= now).length;
  const docExpiringIn30 = documents.filter((d) => d.expiry_date && new Date(d.expiry_date) <= in30 && new Date(d.expiry_date) >= now).length;
  const vehicleExpiringIn30 = (vehiclesData || []).filter((v: any) => {
    const license = v.license_disk_expiry || v.licenseDiskExpiry;
    const roadworthy = v.roadworthy_expiry || v.roadworthyExpiry;
    const insurance = v.insurance_expiry || v.insuranceExpiry;
    const anyExpiry = [license, roadworthy, insurance].filter(Boolean).map((d) => new Date(d));
    return anyExpiry.some((d) => d <= in30 && d >= now);
  }).length;
  const vehicleExpiringIn7 = (vehiclesData || []).filter((v: any) => {
    const license = v.license_disk_expiry || v.licenseDiskExpiry;
    const roadworthy = v.roadworthy_expiry || v.roadworthyExpiry;
    const insurance = v.insurance_expiry || v.insuranceExpiry;
    const anyExpiry = [license, roadworthy, insurance].filter(Boolean).map((d) => new Date(d));
    return anyExpiry.some((d) => d <= in7 && d >= now);
  }).length;
  const atRiskCount = documents.filter((d) => d.expiry_date && new Date(d.expiry_date) <= in7).length
    + (vehiclesData || []).filter((v: any) => {
        const license = v.license_disk_expiry || v.licenseDiskExpiry;
        const roadworthy = v.roadworthy_expiry || v.roadworthyExpiry;
        const insurance = v.insurance_expiry || v.insuranceExpiry;
        return [license, roadworthy, insurance].some((d) => d && new Date(d) <= in7);
      }).length;
  const actionRequiredJobsCount = assignedOrders.filter((o: any) => ["assigned", "en_route", "picked_up"].includes(o.state)).length;
  const actionRequiredComplianceCount = documents.filter((d) => {
    const pending = (d.verification_status === "pending" || d.verification_status === "pending_review");
    const expiring7 = d.expiry_date && new Date(d.expiry_date) <= in7 && new Date(d.expiry_date) >= now;
    const overdue = d.expiry_date && new Date(d.expiry_date) < now;
    return pending || expiring7 || overdue;
  }).length;
  const actionRequiredVehiclesCount = (vehiclesData || []).filter((v: any) => {
    const license = v.license_disk_expiry || v.licenseDiskExpiry;
    const roadworthy = v.roadworthy_expiry || v.roadworthyExpiry;
    const insurance = v.insurance_expiry || v.insuranceExpiry;
    const anyIn30 = [license, roadworthy, insurance].filter(Boolean).map((d) => new Date(d));
    return anyIn30.some((d) => d <= in30 && d >= now);
  }).length;

  // Critical alerts (all tiers)
  const criticalAlerts: { label: string; href?: string }[] = [];
  if (!hasActiveSubscription) criticalAlerts.push({ label: "Subscribe to start working", href: "/driver/subscription" });
  const isKYCApproved = driverProfile?.status === "active" && driverProfile?.compliance_status === "approved";
  if (!isKYCApproved && driverProfile) criticalAlerts.push({ label: "Complete compliance", href: "/driver/profile" });
  const hasPricing = pricingData.length > 0 && pricingData.some((p: any) => p.pricing && p.pricing.active);
  if (!hasPricing) criticalAlerts.push({ label: "Set fuel pricing", href: "/driver" });
  if (vehiclesData.length === 0) criticalAlerts.push({ label: "Add a vehicle", href: "/driver" });
  const hasCoordinates = driverProfile?.current_lat && driverProfile?.current_lng;
  if (!hasCoordinates && driverProfile) criticalAlerts.push({ label: "Set your location in Settings", href: "/driver" });
  if (docExpiringIn7 + (vehicleExpiringIn7 > 0 ? 1 : 0) > 0) criticalAlerts.push({ label: `Documents expiring (${docExpiringIn7})`, href: "/driver/profile" });
  if (vehicleExpiringIn7 > 0) criticalAlerts.push({ label: `Vehicle renewals due (${vehicleExpiringIn7})`, href: "/driver" });

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
    <div className="min-h-screen bg-background pb-safe flex flex-col driver-dashboard-root" data-driver-dashboard="side-menu">
      <style>{`.driver-dashboard-root [role="tablist"]:not(.driver-dashboard-actions-tabs) { display: none !important; }
.driver-dashboard-root .inline-flex.h-10.items-center.rounded-md.bg-muted:not(.driver-dashboard-actions-tabs) { display: none !important; }`}</style>
      <AppHeader />

      <div className="flex flex-1 min-h-0">
        <DashboardSidebarAside aria-label="Driver navigation">
          <DashboardSidebarInner label="Driver workspace">
            <DashboardNavSection>
              <DashboardNavButton
                active={activeTab === "overview"}
                icon={Home}
                onClick={() => setActiveTab("overview")}
                data-testid="tab-overview"
              >
                Dashboard
              </DashboardNavButton>
              <DashboardNavButton
                active={activeTab === "assigned"}
                icon={Package}
                onClick={() => setActiveTab("assigned")}
                data-testid="tab-assigned"
              >
                My Jobs
              </DashboardNavButton>
              <DashboardNavButton
                active={activeTab === "vehicles"}
                icon={Car}
                onClick={() => setActiveTab("vehicles")}
                data-testid="tab-vehicles"
              >
                Vehicles
              </DashboardNavButton>
              <DashboardNavButton
                active={activeTab === "pricing"}
                icon={DollarSign}
                onClick={() => setActiveTab("pricing")}
                data-testid="tab-pricing"
              >
                Pricing
              </DashboardNavButton>
              <DashboardNavLink href="/driver/subscription" icon={CreditCard}>
                Billing
              </DashboardNavLink>
              <DashboardNavButton
                active={activeTab === "settings"}
                icon={Settings}
                onClick={() => setActiveTab("settings")}
                data-testid="tab-settings"
              >
                Settings
              </DashboardNavButton>
              <DashboardNavButton
                active={activeTab === "history"}
                icon={History}
                onClick={() => setActiveTab("history")}
                data-testid="tab-history"
              >
                History
              </DashboardNavButton>
            </DashboardNavSection>
            <DashboardSidebarDivider />
            <DashboardNavSection title="Depot supply">
              <DashboardNavButton
                active={activeTab === "depot-orders"}
                icon={Warehouse}
                onClick={() => setActiveTab("depot-orders")}
                data-testid="tab-depot-orders"
              >
                My depot orders
              </DashboardNavButton>
              <DashboardNavButton
                active={activeTab === "available-depots"}
                icon={Store}
                onClick={() => setActiveTab("available-depots")}
                data-testid="tab-available-depots"
              >
                Available depots
              </DashboardNavButton>
            </DashboardNavSection>
          </DashboardSidebarInner>
        </DashboardSidebarAside>

        <main className="flex-1 min-w-0 overflow-auto dashboard-main-area">
        <div className="w-full min-w-0 px-5 sm:px-8 lg:px-10 py-4 sm:py-8">
        {/* Separate Dashboard view (template-style): only alerts, KPIs, Action Required, etc. No My Jobs/Vehicles/Pricing here. */}
        {activeTab === "overview" && (
        <div className="space-y-6">
        {/* Hero header */}
        <div className="mb-6 sm:mb-8 rounded-2xl border border-border/60 bg-gradient-to-br from-card/95 via-card/80 to-primary/[0.06] p-6 sm:p-8 shadow-lg shadow-primary/[0.07] backdrop-blur-sm">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="space-y-1">
              <p className="text-xs font-semibold uppercase tracking-widest text-primary/90">Overview</p>
              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Driver dashboard</h1>
              <p className="text-sm text-muted-foreground max-w-xl">
                {profile?.fullName
                  ? `Welcome back, ${profile.fullName}. Track jobs, vehicles, and earnings in one place.`
                  : "Manage your deliveries, vehicles, and pricing from one place."}
              </p>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0 flex-wrap">
              {driverProfile && (
                <Badge
                  variant={
                    driverProfile.status === "active" && driverProfile.compliance_status === "approved"
                      ? "default"
                      : "secondary"
                  }
                  className="text-sm px-3 py-1 rounded-full shadow-sm"
                >
                  {driverProfile.status === "active" && driverProfile.compliance_status === "approved"
                    ? "Active"
                    : "Inactive"}
                </Badge>
              )}
              {canExport && (
                <Button
                  variant="outline"
                  size="sm"
                  className="rounded-full border-primary/25 bg-background/80 shadow-sm"
                  onClick={async () => {
                    try {
                      const { getAuthHeaders } = await import("@/lib/auth-headers");
                      const headers = await getAuthHeaders();
                      const res = await fetch("/api/driver/stats/export?format=csv", { credentials: "include", headers });
                      if (!res.ok) throw new Error(await res.text());
                      const blob = await res.blob();
                      const a = document.createElement("a");
                      a.href = URL.createObjectURL(blob);
                      a.download = "earnings-export.csv";
                      a.click();
                      URL.revokeObjectURL(a.href);
                    } catch (e: any) {
                      toast({ title: "Export failed", description: e.message, variant: "destructive" });
                    }
                  }}
                >
                  <Download className="h-4 w-4 mr-2" />
                  Export (CSV)
                </Button>
              )}
            </div>
          </div>
        </div>

        {/* Critical Alerts banner (all tiers) */}
        {criticalAlerts.length > 0 && (
          <Alert className="mb-4 sm:mb-6 border-destructive/50 bg-destructive/10">
            <AlertTriangle className="h-4 w-4 text-destructive" />
            <AlertTitle>{criticalAlerts.length} item{criticalAlerts.length !== 1 ? "s" : ""} require attention</AlertTitle>
            <AlertDescription>
              <ul className="list-disc list-inside mt-2 space-y-1">
                {criticalAlerts.map((a, i) => (
                  <li key={i}>
                    {a.href ? (
                      <Link href={a.href} className="text-primary hover:underline">{a.label}</Link>
                    ) : (
                      a.label
                    )}
                  </li>
                ))}
              </ul>
            </AlertDescription>
          </Alert>
        )}

        {hasActiveSubscription && subscription && (
          <div className="mb-4 flex items-center gap-2 text-sm text-muted-foreground">
            <Badge variant="secondary">{subscription.plan?.name ?? subscription.planCode}</Badge>
            {subscription.nextBillingAt && (
              <span>Next billing: {new Date(subscription.nextBillingAt).toLocaleDateString()}</span>
            )}
            <Link href="/driver/subscription">
              <Button variant="ghost" size="sm">Manage subscription</Button>
            </Link>
          </div>
        )}

        {/* KPI cards: 3 cards for all tiers */}
        <div className={cn("grid gap-4 sm:gap-5 mb-6 sm:mb-8", "grid-cols-1 sm:grid-cols-3")}>
          <StatsCard title="Earnings This Week" value={todayEarningsDisplay} icon={Wallet} />
          <StatsCard title="Active Jobs" value={activeJobsDisplay} description="In progress" icon={TrendingUp} />
          <StatsCard title="Completed" value={completedThisWeekDisplay} description="This week" icon={CheckCircle} />
        </div>

        {/* Starter plan: show My Jobs on dashboard as before */}
        {isStarterDashboard && (
          <div className="mb-6 space-y-4">
            <h2 className="text-lg font-semibold">My Jobs</h2>
            <DriverLocationTracker
              isOnDelivery={true}
              activeOrderId={assignedOrders.find((o: any) => o.state === "en_route" || o.state === "picked_up")?.id || null}
            />
            {(() => {
              const isKYCApproved = driverProfile?.status === "active" && driverProfile?.compliance_status === "approved";
              const hasPricing = pricingData && pricingData.length > 0 && pricingData.some((p: any) => p.pricing && p.pricing.active);
              const hasVehicle = vehiclesData && vehiclesData.length > 0;
              const hasCoordinates = driverProfile?.current_lat && driverProfile?.current_lng;
              const allComplete = isKYCApproved && hasPricing && hasVehicle && hasCoordinates;
              if (allComplete) return null;
              return (
                <Alert className="border-yellow-200 bg-yellow-50 dark:bg-yellow-950/20">
                  <AlertCircle className="h-4 w-4 text-yellow-600 dark:text-yellow-500" />
                  <AlertTitle className="text-yellow-900 dark:text-yellow-100">Setup Required</AlertTitle>
                  <AlertDescription className="text-yellow-800 dark:text-yellow-200 mt-2">
                    <p className="mb-3">Complete the following to start receiving orders:</p>
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        {isKYCApproved ? <CheckCircle2 className="h-4 w-4 text-green-600" /> : <XCircle className="h-4 w-4 text-yellow-600" />}
                        <span className={isKYCApproved ? "text-green-700 dark:text-green-300" : ""}>KYC Approval (Complete compliance profile)</span>
                      </div>
                      <div className="flex items-center gap-2">
                        {hasPricing ? <CheckCircle2 className="h-4 w-4 text-green-600" /> : <XCircle className="h-4 w-4 text-yellow-600" />}
                        <span className={hasPricing ? "text-green-700 dark:text-green-300" : ""}>Fuel Pricing (Set your fuel prices)</span>
                      </div>
                      <div className="flex items-center gap-2">
                        {hasVehicle ? <CheckCircle2 className="h-4 w-4 text-green-600" /> : <XCircle className="h-4 w-4 text-yellow-600" />}
                        <span className={hasVehicle ? "text-green-700 dark:text-green-300" : ""}>Vehicle (Add at least one vehicle)</span>
                      </div>
                      <div className="flex items-center gap-2">
                        {hasCoordinates ? <CheckCircle2 className="h-4 w-4 text-green-600" /> : <XCircle className="h-4 w-4 text-yellow-600" />}
                        <span className={hasCoordinates ? "text-green-700 dark:text-green-300" : ""}>Coordinates (Set your location in Settings)</span>
                      </div>
                    </div>
                    <Button variant="outline" size="sm" className="mt-4 border-yellow-300 text-yellow-900 hover:bg-yellow-100 dark:text-yellow-100 dark:border-yellow-800 dark:hover:bg-yellow-900/30" onClick={() => setLocation("/driver/profile")}>
                      Complete Setup
                      <ArrowRight className="h-3 w-3 ml-2" />
                    </Button>
                  </AlertDescription>
                </Alert>
              );
            })()}
            {loadingAssigned ? (
              <div className="text-center py-8 sm:py-12 text-muted-foreground"><p>Loading assigned orders...</p></div>
            ) : assignedOrders.length === 0 ? (
              <div className="text-center py-8 sm:py-12 text-muted-foreground">
                <p>No assigned jobs yet</p>
                <p className="text-sm mt-2">Accepted deliveries will appear here</p>
              </div>
            ) : (
              <div className="space-y-4">
                {assignedOrders.map((order) => {
                  const isStarting = startDeliveryMutation.isPending && startDeliveryMutation.variables === order.id;
                  const isPickingUp = pickupDeliveryMutation.isPending && pickupDeliveryMutation.variables === order.id;
                  const customerName = order.customers?.profiles?.full_name || order.customers?.company_name || "Customer";
                  const fuelTypeLabel = order.fuel_types?.label || order.fuel_types?.code?.toUpperCase() || "N/A";
                  const deliveryAddress = order.delivery_addresses
                    ? [order.delivery_addresses.address_street, order.delivery_addresses.address_city, order.delivery_addresses.address_province].filter(Boolean).join(", ") || "Address not specified"
                    : order.drop_lat && order.drop_lng ? `${order.drop_lat}, ${order.drop_lng}` : "Address not specified";
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
                              <CardTitle className="text-lg">{order.fuel_types?.label || "Fuel"} - {parseFloat(order.litres)}L</CardTitle>
                              <p className="text-sm text-muted-foreground mt-0.5">Order #{order.id.slice(-8)}</p>
                            </div>
                          </div>
                          <StatusBadge status={order.state} />
                        </div>
                      </CardHeader>
                      <CardContent className="p-0">
                        <div className="flex flex-col border-t border-border/80 lg:flex-row">
                          <div className="flex-1 min-w-0 space-y-6 bg-muted/25 p-6 dark:bg-muted/15">
                            <div className="flex items-start gap-3 rounded-xl border border-border/60 bg-background/60 p-3 shadow-sm dark:bg-background/40">
                              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-primary">
                                <ClipboardList className="h-5 w-5" />
                              </div>
                              <div className="min-w-0 pt-0.5">
                                <p className="text-[11px] font-bold uppercase tracking-widest text-primary">Order details</p>
                                <p className="text-xs text-muted-foreground">Actions, customer, and delivery information</p>
                              </div>
                            </div>
                            <div className="flex flex-wrap gap-2">
                              {order.state === "assigned" && (
                                <Button onClick={() => handleStartDelivery(order.id)} disabled={isStarting} variant="default" className="flex items-center gap-2" size="sm">
                                  <Truck className="h-4 w-4" />
                                  {isStarting ? "Starting..." : "Start Delivery"}
                                </Button>
                              )}
                              {order.state === "en_route" && (
                                <Button onClick={() => handlePickupDelivery(order.id)} disabled={isPickingUp} variant="secondary" className="flex items-center gap-2" size="sm">
                                  <Package className="h-4 w-4" />
                                  {isPickingUp ? "Updating..." : "Mark Picked Up"}
                                </Button>
                              )}
                              {order.state === "picked_up" && (
                                <Button onClick={() => handleCompleteDelivery(order)} variant="default" className="flex items-center gap-2 bg-green-600 hover:bg-green-700" size="sm">
                                  <CheckCircle className="h-4 w-4" />
                                  Complete Delivery
                                </Button>
                              )}
                            </div>
                            <div className="space-y-4">
                              <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/50">
                                <div className="p-1.5 rounded-md bg-background"><User className="h-4 w-4 text-muted-foreground" /></div>
                                <div className="flex-1 min-w-0">
                                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">Customer</p>
                                  <p className="font-semibold text-sm truncate">{customerName}</p>
                                </div>
                              </div>
                              <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/50">
                                <div className="p-1.5 rounded-md bg-background"><Package className="h-4 w-4 text-muted-foreground" /></div>
                                <div className="flex-1 min-w-0">
                                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">Fuel Type</p>
                                  <p className="font-medium text-sm">{fuelTypeLabel}</p>
                                </div>
                              </div>
                              <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/50">
                                <div className="p-1.5 rounded-md bg-background"><DollarSign className="h-4 w-4 text-muted-foreground" /></div>
                                <div className="flex-1 min-w-0">
                                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">Amount</p>
                                  <p className="font-semibold text-base text-green-600 dark:text-green-400">{formatCurrencyAmount(order.total_cents / 100)}</p>
                                </div>
                              </div>
                              <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/50">
                                <div className="p-1.5 rounded-md bg-background"><MapPin className="h-4 w-4 text-muted-foreground" /></div>
                                <div className="flex-1 min-w-0">
                                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">Delivery Address</p>
                                  <p className="font-medium text-sm leading-relaxed">{deliveryAddress}</p>
                                </div>
                              </div>
                              <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/50">
                                <div className="p-1.5 rounded-md bg-background"><Phone className="h-4 w-4 text-muted-foreground" /></div>
                                <div className="flex-1 min-w-0">
                                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">Contact</p>
                                  <p className="font-medium text-sm">{customerPhone}</p>
                                </div>
                              </div>
                            </div>
                          </div>
                          <div
                            className="relative flex min-h-0 flex-col border-t border-primary/25 bg-gradient-to-b from-primary/[0.08] via-muted/30 to-background p-6 dark:from-primary/[0.12] dark:via-muted/20 lg:w-[min(100%,420px)] lg:shrink-0 lg:border-l-2 lg:border-t-0 lg:border-primary/35 xl:w-[440px]"
                            aria-label="Order chat"
                          >
                            <span
                              className="pointer-events-none absolute left-0 top-4 bottom-4 hidden w-1 rounded-full bg-gradient-to-b from-primary from-40% via-primary/50 to-transparent lg:block"
                              aria-hidden
                            />
                            <div className="mb-4 flex items-center gap-2 rounded-lg border border-primary/20 bg-primary/10 px-3 py-2 dark:bg-primary/15">
                              <MessageCircle className="h-5 w-5 shrink-0 text-primary" />
                              <div>
                                <p className="text-sm font-semibold leading-tight">Messages</p>
                                <p className="text-xs text-muted-foreground">Chat with the customer about this order</p>
                              </div>
                            </div>
                            <OrderChat orderId={order.id} currentUserType="driver" variant="embedded" />
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Action Required + Upcoming Due in same row (70% / 30%), then At Risk — advanced dashboard only */}
        {!isStarterDashboard && (
          <>
            <div className="flex flex-col lg:flex-row gap-4 mb-6">
              <Card className="lg:w-[70%] rounded-xl border-border/50 shadow-lg shadow-black/5 overflow-hidden min-w-0">
                <CardHeader className="pb-2">
                  <CardTitle className="text-lg flex items-center gap-2">
                    <AlertTriangle className="h-5 w-5 text-amber-600" />
                    Action Required
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-0">
                <Tabs defaultValue="jobs" className="w-full">
                  <TabsList className="driver-dashboard-actions-tabs grid w-full grid-cols-3">
                    <TabsTrigger value="jobs">Jobs ({actionRequiredJobsCount})</TabsTrigger>
                    <TabsTrigger value="compliance">Compliance ({actionRequiredComplianceCount})</TabsTrigger>
                    <TabsTrigger value="vehicles">Vehicles ({actionRequiredVehiclesCount})</TabsTrigger>
                  </TabsList>
                  <TabsContent value="jobs" className="mt-3">
                    {actionRequiredJobsCount === 0 ? (
                      <p className="text-sm text-muted-foreground">No jobs needing action.</p>
                    ) : (
                      <ul className="space-y-2">
                        {assignedOrders.filter((o: any) => ["assigned", "en_route", "picked_up"].includes(o.state)).slice(0, 5).map((order: any) => (
                          <li key={order.id} className="flex items-center justify-between rounded-lg border p-3 text-sm">
                            <span>Order #{order.id.slice(-8)} — {order.state.replace("_", " ")}</span>
                            <Badge variant="secondary">{order.state === "assigned" ? "Start delivery" : order.state === "en_route" ? "Mark picked up" : "Complete"}</Badge>
                          </li>
                        ))}
                      </ul>
                    )}
                  </TabsContent>
                  <TabsContent value="compliance" className="mt-3">
                    {actionRequiredComplianceCount === 0 ? (
                      <p className="text-sm text-muted-foreground">No compliance items due.</p>
                    ) : (
                      <ul className="space-y-2">
                        {documents.filter((d) => {
                          const pending = (d.verification_status === "pending" || d.verification_status === "pending_review");
                          const expiring7 = d.expiry_date && new Date(d.expiry_date) <= in7 && new Date(d.expiry_date) >= now;
                          const overdue = d.expiry_date && new Date(d.expiry_date) < now;
                          return pending || expiring7 || overdue;
                        }).slice(0, 5).map((d) => (
                          <li key={d.id} className="flex items-center justify-between rounded-lg border p-3 text-sm">
                            <span>{d.title || d.doc_type}</span>
                            <Link href="/driver/profile">
                              <Button variant="outline" size="sm">Review</Button>
                            </Link>
                          </li>
                        ))}
                      </ul>
                    )}
                  </TabsContent>
                  <TabsContent value="vehicles" className="mt-3">
                    {actionRequiredVehiclesCount === 0 ? (
                      <p className="text-sm text-muted-foreground">No vehicle renewals due soon.</p>
                    ) : (
                      <ul className="space-y-2">
                        {(vehiclesData || []).filter((v: any) => {
                          const license = v.license_disk_expiry || v.licenseDiskExpiry;
                          const roadworthy = v.roadworthy_expiry || v.roadworthyExpiry;
                          const insurance = v.insurance_expiry || v.insuranceExpiry;
                          const anyIn30 = [license, roadworthy, insurance].filter(Boolean).map((d) => new Date(d));
                          return anyIn30.some((d) => d <= in30 && d >= now);
                        }).slice(0, 5).map((v: any) => (
                          <li key={v.id} className="flex items-center justify-between rounded-lg border p-3 text-sm">
                            <span>{v.registration_number || v.registrationNumber || "Vehicle"}</span>
                            <button type="button" onClick={() => setActiveTab("vehicles")} className="text-primary hover:underline text-sm">View</button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </TabsContent>
                </Tabs>
                </CardContent>
              </Card>

              <Card className="lg:w-[30%] rounded-xl border-border/50 shadow-lg shadow-black/5 min-w-0 shrink-0">
                <CardHeader className="py-3 pb-2">
                  <CardTitle className="text-base flex items-center justify-center gap-2">
                    <CalendarClock className="h-5 w-5 text-amber-500" />
                    Upcoming Due
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-0 space-y-2">
                  <div className="flex items-center justify-between rounded-lg bg-muted/60 px-3 py-2.5 gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <FileCheck className="h-4 w-4 shrink-0 text-muted-foreground" />
                      <span className="text-sm font-medium truncate">Documents (7 days)</span>
                    </div>
                    <span className="shrink-0 rounded-md bg-muted px-2 py-0.5 text-sm font-medium tabular-nums">
                      {docExpiringIn7}
                    </span>
                  </div>
                  <div className="flex items-center justify-between rounded-lg bg-muted/60 px-3 py-2.5 gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <FileCheck className="h-4 w-4 shrink-0 text-muted-foreground" />
                      <span className="text-sm font-medium truncate">Documents (30 days)</span>
                    </div>
                    <span className="shrink-0 rounded-md bg-muted px-2 py-0.5 text-sm font-medium tabular-nums">
                      {docExpiringIn30}
                    </span>
                  </div>
                  <div className="flex items-center justify-between rounded-lg bg-muted/60 px-3 py-2.5 gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <Car className="h-4 w-4 shrink-0 text-muted-foreground" />
                      <span className="text-sm font-medium truncate">Vehicle renewals (30 days)</span>
                    </div>
                    <span className="shrink-0 rounded-md bg-muted px-2 py-0.5 text-sm font-medium tabular-nums">
                      {vehicleExpiringIn30}
                    </span>
                  </div>
                  <div className="flex items-center justify-between rounded-lg bg-muted/60 px-3 py-2.5 gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <Calendar className="h-4 w-4 shrink-0 text-muted-foreground" />
                      <span className="text-sm font-medium truncate">Next billing</span>
                    </div>
                    <span className="shrink-0 rounded-md bg-muted px-2 py-0.5 text-sm font-medium tabular-nums">
                      {subscription?.nextBillingAt ? new Date(subscription.nextBillingAt).toLocaleDateString(undefined, { dateStyle: "short" }) : "—"}
                    </span>
                  </div>
                </CardContent>
              </Card>
            </div>

            <Card className="mb-6 rounded-xl border-border/50 shadow-md py-3 px-4">
              <div className="flex items-center gap-2">
                <Shield className="h-5 w-5 text-muted-foreground" />
                <span className="text-sm font-medium">Compliance at risk – {atRiskCount}</span>
                {(atRiskCount > 0) && (
                  <Link href="/driver/profile">
                    <Button variant="ghost" size="sm" className="h-auto p-0 text-primary hover:underline">Review</Button>
                  </Link>
                )}
              </div>
            </Card>
          </>
        )}

        {/* Starter: optional upgrade CTA for earnings trends */}
        {isStarterDashboard && hasActiveSubscription && (
          <Card className="mb-6 rounded-xl border-dashed border-2 border-primary/20 bg-primary/5">
            <CardContent className="py-6 text-center text-sm text-muted-foreground">
              Upgrade to Professional for earnings trends, action summaries, and more.
              <Link href="/driver/subscription" className="block mt-2">
                <Button variant="outline" size="sm">View plans</Button>
              </Link>
            </CardContent>
          </Card>
        )}

        {/* Charts row: Activity Trends + Earnings by fuel type */}
        {canAdvancedStats && (statsAdvanced?.earningsByWeek || (statsAdvanced?.earningsByFuelType && Object.keys(statsAdvanced.earningsByFuelType).length > 0)) && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
            {/* Activity Trends (12 weeks) — Bar chart */}
            {statsAdvanced?.earningsByWeek && (() => {
              const byWeek = statsAdvanced.earningsByWeek;
              const chartData: { week: string; label: string; earnings: number; fullLabel: string }[] = [];
              for (let i = 11; i >= 0; i--) {
                const d = new Date();
                d.setDate(d.getDate() - i * 7);
                const y = d.getFullYear();
                const w = Math.ceil(d.getDate() / 7);
                const key = `${y}-W${String(w).padStart(2, "0")}`;
                const cents = byWeek[key] || 0;
                const shortLabel = d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
                chartData.push({
                  week: key,
                  label: shortLabel,
                  earnings: cents / 100,
                  fullLabel: `${key}: ${formatCurrencyAmount(cents / 100)}`,
                });
              }
              return (
                <Card className="overflow-hidden rounded-xl border-border/50 shadow-lg shadow-black/5">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-lg flex items-center gap-2">Activity Trends</CardTitle>
                    <CardDescription>Earnings by week (last 12 weeks)</CardDescription>
                  </CardHeader>
                  <CardContent className="pt-0">
                    <div className="h-[280px] w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                          <defs>
                            <linearGradient id="earningsBarGradient" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.9} />
                              <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0.5} />
                            </linearGradient>
                          </defs>
                          <CartesianGrid strokeDasharray="3 3" className="stroke-muted/50" vertical={false} />
                          <XAxis
                            dataKey="label"
                            tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                            axisLine={false}
                            tickLine={false}
                          />
                          <YAxis
                            tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                            axisLine={false}
                            tickLine={false}
                            tickFormatter={(v) => (v >= 1000 ? `R ${(v / 1000).toFixed(0)}k` : `R ${v}`)}
                          />
                          <Tooltip
                            contentStyle={{
                              backgroundColor: "hsl(var(--background))",
                              border: "1px solid hsl(var(--border))",
                              borderRadius: "8px",
                              boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
                            }}
                            labelStyle={{ color: "hsl(var(--foreground))" }}
                            formatter={(value: number) => [formatCurrencyAmount(value), "Earnings"]}
                            labelFormatter={(_, payload) => payload[0]?.payload?.fullLabel ?? ""}
                          />
                          <Bar dataKey="earnings" fill="url(#earningsBarGradient)" radius={[6, 6, 0, 0]} maxBarSize={48} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </CardContent>
                </Card>
              );
            })()}

            {/* Earnings by fuel type — Pie chart */}
            {statsAdvanced?.earningsByFuelType && Object.keys(statsAdvanced.earningsByFuelType).length > 0 && (() => {
              const fuelColors = ["#0ea5e9", "#22c55e", "#eab308", "#f97316", "#8b5cf6", "#ec4899"];
              const data = Object.entries(statsAdvanced.earningsByFuelType).map(([name, cents], i) => ({
                name,
                value: cents / 100,
                fill: fuelColors[i % fuelColors.length],
              }));
              return (
                <Card className="overflow-hidden rounded-xl border-border/50 shadow-lg shadow-black/5">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-lg flex items-center gap-2">Earnings by fuel type</CardTitle>
                    <CardDescription>Share of total earnings</CardDescription>
                  </CardHeader>
                  <CardContent className="pt-0">
                    <div className="h-[280px] w-full flex items-center justify-center">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={data}
                            cx="50%"
                            cy="50%"
                            innerRadius={60}
                            outerRadius={90}
                            paddingAngle={2}
                            dataKey="value"
                            label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                            labelLine={{ stroke: "hsl(var(--muted-foreground))", strokeWidth: 1 }}
                          >
                            {data.map((entry, index) => (
                              <Cell key={`cell-${index}`} fill={entry.fill} stroke="hsl(var(--background))" strokeWidth={2} />
                            ))}
                          </Pie>
                          <Tooltip
                            contentStyle={{
                              backgroundColor: "hsl(var(--background))",
                              border: "1px solid hsl(var(--border))",
                              borderRadius: "8px",
                              boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
                            }}
                            formatter={(value: number) => [formatCurrencyAmount(value), ""]}
                            itemStyle={{ color: "hsl(var(--foreground))" }}
                          />
                          <Legend
                            verticalAlign="bottom"
                            height={36}
                            formatter={(value, entry: any) => (
                              <span className="text-muted-foreground text-sm">
                                {value}: {formatCurrencyAmount(entry?.payload?.value ?? 0)}
                              </span>
                            )}
                          />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                  </CardContent>
                </Card>
              );
            })()}
          </div>
        )}

        {/* Fuel Cost Tracker — Professional/Premium only */}
        {canAdvancedStats && (
          <Card className="mb-6 rounded-xl border-border/50 shadow-lg shadow-black/5 overflow-hidden">
            <CardHeader className="py-4">
              <CardTitle className="text-base">Fuel Cost Tracker</CardTitle>
              <CardDescription>Track fuel spend per delivery</CardDescription>
            </CardHeader>
            <CardContent className="pt-0">
              {statsAdvanced?.fuelCostByDelivery && statsAdvanced.fuelCostByDelivery.length > 0 ? (
                <div className="space-y-4">
                  <div className="flex flex-wrap items-center gap-4 rounded-lg bg-muted/50 p-3 text-sm">
                    <span className="font-medium text-foreground">Total fuel spend (all time):</span>
                    <span className="font-semibold text-primary">
                      {formatCurrencyAmount((statsAdvanced.totalFuelCostCents ?? 0) / 100)}
                    </span>
                  </div>
                  <div className="rounded-md border overflow-hidden">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b bg-muted/50">
                          <th className="text-left font-medium py-2.5 px-3">Date</th>
                          <th className="text-left font-medium py-2.5 px-3">Fuel type</th>
                          <th className="text-right font-medium py-2.5 px-3">Litres</th>
                          <th className="text-right font-medium py-2.5 px-3">Fuel cost</th>
                          <th className="text-right font-medium py-2.5 px-3">Delivery fee</th>
                        </tr>
                      </thead>
                      <tbody>
                        {statsAdvanced.fuelCostByDelivery.map((row) => (
                          <tr key={row.id} className="border-b last:border-0 hover:bg-muted/30">
                            <td className="py-2.5 px-3 text-muted-foreground">
                              {row.deliveredAt ? new Date(row.deliveredAt).toLocaleDateString(undefined, { dateStyle: "short" }) : "—"}
                            </td>
                            <td className="py-2.5 px-3">{row.fuelType}</td>
                            <td className="py-2.5 px-3 text-right tabular-nums">{row.litres.toLocaleString()}</td>
                            <td className="py-2.5 px-3 text-right tabular-nums text-amber-600 dark:text-amber-400">
                              {formatCurrencyAmount(row.fuelCostCents / 100)}
                            </td>
                            <td className="py-2.5 px-3 text-right tabular-nums text-green-600 dark:text-green-400">
                              {formatCurrencyAmount(row.deliveryFeeCents / 100)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Last 15 deliveries. Upgrade to Premium to export full history.
                  </p>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground py-2">
                  No deliveries yet. Fuel cost per delivery will appear here once you complete deliveries.
                </p>
              )}
            </CardContent>
          </Card>
        )}
        </div>
        )}

        {/* Mobile menu button + sheet (only when sidebar is hidden) */}
          <Button
            variant="outline"
            size="icon"
            className="md:hidden fixed bottom-4 right-4 z-40 rounded-full shadow-lg"
            onClick={() => setSidebarOpen(true)}
            aria-label="Open menu"
          >
            <Menu className="h-5 w-5" />
          </Button>

          <Sheet open={sidebarOpen} onOpenChange={setSidebarOpen}>
            <SheetContent
              side="left"
              className="w-[min(100vw-2rem,288px)] p-0 overflow-hidden flex flex-col bg-sidebar border-r border-sidebar-border"
            >
              <div className="flex flex-col h-full min-h-0">
                <DashboardSidebarInner label="Menu">
                  <DashboardNavSection>
                    <DashboardNavButton
                      active={activeTab === "overview"}
                      icon={Home}
                      onClick={() => { setActiveTab("overview"); setSidebarOpen(false); }}
                    >
                      Dashboard
                    </DashboardNavButton>
                    <DashboardNavButton
                      active={activeTab === "assigned"}
                      icon={Package}
                      onClick={() => { setActiveTab("assigned"); setSidebarOpen(false); }}
                    >
                      My Jobs
                    </DashboardNavButton>
                    <DashboardNavButton
                      active={activeTab === "vehicles"}
                      icon={Car}
                      onClick={() => { setActiveTab("vehicles"); setSidebarOpen(false); }}
                    >
                      Vehicles
                    </DashboardNavButton>
                    <DashboardNavButton
                      active={activeTab === "pricing"}
                      icon={DollarSign}
                      onClick={() => { setActiveTab("pricing"); setSidebarOpen(false); }}
                    >
                      Pricing
                    </DashboardNavButton>
                    <DashboardNavLink
                      href="/driver/subscription"
                      icon={CreditCard}
                      onNavigate={() => setSidebarOpen(false)}
                    >
                      Billing
                    </DashboardNavLink>
                    <DashboardNavButton
                      active={activeTab === "settings"}
                      icon={Settings}
                      onClick={() => { setActiveTab("settings"); setSidebarOpen(false); }}
                    >
                      Settings
                    </DashboardNavButton>
                    <DashboardNavButton
                      active={activeTab === "history"}
                      icon={History}
                      onClick={() => { setActiveTab("history"); setSidebarOpen(false); }}
                    >
                      History
                    </DashboardNavButton>
                  </DashboardNavSection>
                  <DashboardSidebarDivider />
                  <DashboardNavSection title="Depot supply">
                    <DashboardNavButton
                      active={activeTab === "depot-orders"}
                      icon={Warehouse}
                      onClick={() => { setActiveTab("depot-orders"); setSidebarOpen(false); }}
                    >
                      My depot orders
                    </DashboardNavButton>
                    <DashboardNavButton
                      active={activeTab === "available-depots"}
                      icon={Store}
                      onClick={() => { setActiveTab("available-depots"); setSidebarOpen(false); }}
                    >
                      Available depots
                    </DashboardNavButton>
                  </DashboardNavSection>
                </DashboardSidebarInner>
              </div>
            </SheetContent>
          </Sheet>

          {/* Separate pages: My Jobs, Vehicles, Pricing, etc. (not shown on Dashboard overview) */}
        {activeTab !== "overview" && (
          <div className="flex-1 min-w-0 space-y-4 sm:space-y-6">
            <h1 className="text-2xl font-bold mb-4">
              {activeTab === "assigned" && "My Jobs"}
              {activeTab === "vehicles" && "Vehicles"}
              {activeTab === "pricing" && "Pricing"}
              {activeTab === "settings" && "Settings"}
              {activeTab === "history" && "History"}
              {activeTab === "depot-orders" && "My Depot Orders"}
              {activeTab === "available-depots" && "Available Depots"}
            </h1>
        {activeTab === "assigned" && (
          <div className="space-y-3 sm:space-y-4">
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
                  const fuelTypeLabel = order.fuel_types?.label || order.fuel_types?.code?.toUpperCase() || "N/A";
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
                        <div className="flex flex-col border-t border-border/80 lg:flex-row">
                          <div className="flex-1 min-w-0 space-y-6 bg-muted/25 p-6 dark:bg-muted/15">
                            <div className="flex items-start gap-3 rounded-xl border border-border/60 bg-background/60 p-3 shadow-sm dark:bg-background/40">
                              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-primary">
                                <ClipboardList className="h-5 w-5" />
                              </div>
                              <div className="min-w-0 pt-0.5">
                                <p className="text-[11px] font-bold uppercase tracking-widest text-primary">Order details</p>
                                <p className="text-xs text-muted-foreground">Actions, customer, and delivery information</p>
                              </div>
                            </div>
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
                                  <Package className="h-4 w-4 text-muted-foreground" />
                                </div>
                                <div className="flex-1 min-w-0">
                                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">
                                    Fuel Type
                                  </p>
                                  <p className="font-medium text-sm">
                                    {fuelTypeLabel}
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

                          <div
                            className="relative flex min-h-0 flex-col border-t border-primary/25 bg-gradient-to-b from-primary/[0.08] via-muted/30 to-background p-6 dark:from-primary/[0.12] dark:via-muted/20 lg:w-[min(100%,420px)] lg:shrink-0 lg:border-l-2 lg:border-t-0 lg:border-primary/35 xl:w-[440px]"
                            aria-label="Order chat"
                          >
                            <span
                              className="pointer-events-none absolute left-0 top-4 bottom-4 hidden w-1 rounded-full bg-gradient-to-b from-primary from-40% via-primary/50 to-transparent lg:block"
                              aria-hidden
                            />
                            <div className="mb-4 flex items-center gap-2 rounded-lg border border-primary/20 bg-primary/10 px-3 py-2 dark:bg-primary/15">
                              <MessageCircle className="h-5 w-5 shrink-0 text-primary" />
                              <div>
                                <p className="text-sm font-semibold leading-tight">Messages</p>
                                <p className="text-xs text-muted-foreground">Chat with the customer about this order</p>
                              </div>
                            </div>
                            <OrderChat orderId={order.id} currentUserType="driver" variant="embedded" />
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {activeTab === "depot-orders" && (
          <div className="space-y-3 sm:space-y-4">
            <DriverDepotsView defaultTab="orders" />
          </div>
        )}

        {activeTab === "available-depots" && (
          <div className="space-y-3 sm:space-y-4">
            <DriverDepotsView defaultTab="depots" />
          </div>
        )}

        {activeTab === "vehicles" && (
          <div className="space-y-3 sm:space-y-4">
            <DriverVehicleManager />
          </div>
        )}

        {activeTab === "pricing" && (
          <div className="space-y-3 sm:space-y-4">
            <DriverPricingManager />
          </div>
        )}

        {activeTab === "settings" && (
          <div className="space-y-3 sm:space-y-4">
            <DriverPreferencesManager />
          </div>
        )}

        {activeTab === "history" && (
          <div className="space-y-3 sm:space-y-4">
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
          </div>
        )}
          </div>
        )}
        </div>
        </main>
      </div>

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
    </div>
  );
}
