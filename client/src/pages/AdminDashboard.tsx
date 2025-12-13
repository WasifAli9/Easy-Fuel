import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AppHeader } from "@/components/AppHeader";
import { KYCDocumentCard } from "@/components/KYCDocumentCard";
import { CustomerCard } from "@/components/CustomerCard";
import { DriverCard } from "@/components/DriverCard";
import { SupplierCard } from "@/components/SupplierCard";
import { StatsCard } from "@/components/StatsCard";
import { CreateUserDialog } from "@/components/CreateUserDialog";
import { UserDetailsDialogEnhanced } from "@/components/UserDetailsDialogEnhanced";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Users, Truck, TrendingUp, Building2, UserCheck, Search, Shield, FileText, CheckCircle2, XCircle, Eye, Activity, BarChart3, ArrowUpRight, Filter, Bell, DollarSign, Save, Edit2 } from "lucide-react";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useWebSocket } from "@/hooks/useWebSocket";
import { useNotifications } from "@/hooks/useNotifications";
import { useAuth } from "@/contexts/AuthContext";
import { formatDistanceToNow } from "date-fns";

interface PendingKYC {
  drivers: Array<{
    id: string;
    user_id: string;
    kyc_status: string;
    vehicle_registration?: string;
    profiles: {
      full_name: string;
    };
    created_at: string;
  }>;
  suppliers: Array<{
    id: string;
    owner_id: string;
    name: string;
    kyb_status: string;
    created_at: string;
    profiles: {
      full_name: string;
    };
  }>;
}

interface Customer {
  id: string;
  user_id: string;
  company_name?: string;
  vat_number?: string;
  created_at: string;
  profiles: {
    id: string;
    full_name: string;
    email?: string;
    phone?: string;
    role: string;
    profile_photo_url?: string;
  } | null;
}

interface Driver {
  id: string;
  user_id: string;
  kyc_status: string;
  company_name?: string;
  vehicle_registration?: string;
  created_at: string;
  profiles: {
    id: string;
    full_name: string;
    email?: string;
    phone?: string;
    role: string;
    profile_photo_url?: string;
  } | null;
  vehicles: {
    id: string;
    registration_number: string;
    make?: string;
    model?: string;
    capacity_litres?: number;
    fuel_types?: string[];
  }[];
}

interface Supplier {
  id: string;
  owner_id: string;
  name: string;
  kyb_status: string;
  cipc_number?: string;
  created_at: string;
  profiles: {
    id: string;
    full_name: string;
    email?: string;
    phone?: string;
    role: string;
    profile_photo_url?: string;
  } | null;
}

// Delivery Fee Settings Component
function DeliveryFeeSettings() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { profile } = useAuth(); // Get profile from auth context
  const [isEditing, setIsEditing] = useState(false);
  const [pricePerKm, setPricePerKm] = useState<number>(0);

  // Fetch app settings
  const { data: settings, isLoading, error: settingsError } = useQuery<any>({
    queryKey: ["/api/admin/settings"],
    enabled: !!profile && profile.role === "admin", // Only fetch if admin is logged in
    retry: false, // Don't retry on errors
  });

  // Update price per km when settings load
  useEffect(() => {
    if (settings?.price_per_km_cents) {
      setPricePerKm(settings.price_per_km_cents / 100); // Convert cents to rands
    } else if (!isLoading && !settingsError) {
      // Set default if settings loaded but price_per_km_cents is missing
      setPricePerKm(50); // Default R50 per km
    }
  }, [settings, isLoading, settingsError]);

  // Update mutation
  const updateMutation = useMutation({
    mutationFn: async (newPricePerKm: number) => {
      const response = await apiRequest("PUT", "/api/admin/settings", {
        price_per_km_cents: Math.round(newPricePerKm * 100), // Convert rands to cents
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/settings"] });
      toast({
        title: "Success",
        description: "Delivery fee per km updated successfully",
      });
      setIsEditing(false);
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update delivery fee",
        variant: "destructive",
      });
    },
  });

  const handleSave = () => {
    if (pricePerKm <= 0) {
      toast({
        title: "Invalid Value",
        description: "Price per km must be greater than 0",
        variant: "destructive",
      });
      return;
    }
    updateMutation.mutate(pricePerKm);
  };

  const handleCancel = () => {
    if (settings?.price_per_km_cents) {
      setPricePerKm(settings.price_per_km_cents / 100);
    }
    setIsEditing(false);
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="py-8">
          <div className="text-center text-muted-foreground">Loading settings...</div>
        </CardContent>
      </Card>
    );
  }

  // Handle error gracefully - show default values
  if (settingsError) {
    console.error("Error loading settings:", settingsError);
    // Use default values if API fails
    const defaultSettings = {
      price_per_km_cents: 5000, // R50 per km
      updated_at: null,
    };
    return (
      <Card className="border-2">
        <CardHeader className="bg-gradient-to-r from-primary/5 to-primary/10 border-b">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-primary/10 rounded-lg">
                <DollarSign className="h-6 w-6 text-primary" />
              </div>
              <div>
                <CardTitle className="text-xl">Delivery Fee Configuration</CardTitle>
                <p className="text-sm text-muted-foreground mt-1">
                  Set the default delivery fee per kilometer for all orders
                </p>
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-6">
          <Alert variant="destructive" className="mb-4">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Database Migration Required</AlertTitle>
            <AlertDescription>
              The price_per_km_cents column is missing from the app_settings table. 
              Please run the migration script: <code className="text-xs">server/add-price-per-km-column.sql</code>
            </AlertDescription>
          </Alert>
          <div className="text-center py-8 text-muted-foreground">
            <p>Using default value: R50.00 per km</p>
            <p className="text-xs mt-2">Settings will be available after running the migration.</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-2">
      <CardHeader className="bg-gradient-to-r from-primary/5 to-primary/10 border-b">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-primary/10 rounded-lg">
              <DollarSign className="h-6 w-6 text-primary" />
            </div>
            <div>
              <CardTitle className="text-xl">Delivery Fee Configuration</CardTitle>
              <p className="text-sm text-muted-foreground mt-1">
                Set the default delivery fee per kilometer for all orders
              </p>
            </div>
          </div>
          {!isEditing && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsEditing(true)}
            >
              <Edit2 className="h-4 w-4 mr-2" />
              Edit
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="pt-6">
        <div className="space-y-6">
          <div className="flex items-center justify-between p-6 bg-muted/50 rounded-lg border">
            <div className="flex-1">
              <Label htmlFor="price-per-km" className="text-base font-semibold">
                Delivery Fee Per Kilometer
              </Label>
              <p className="text-sm text-muted-foreground mt-1">
                This rate is used to calculate delivery fees for customer orders based on distance
              </p>
            </div>
            <div className="flex items-center gap-4">
              {isEditing ? (
                <>
                  <div className="flex items-center gap-2">
                    <span className="text-2xl font-bold">R</span>
                    <Input
                      id="price-per-km"
                      type="number"
                      min="0"
                      step="0.01"
                      value={pricePerKm}
                      onChange={(e) => setPricePerKm(parseFloat(e.target.value) || 0)}
                      className="w-32 text-2xl font-bold text-center"
                    />
                    <span className="text-lg text-muted-foreground">/ km</span>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      onClick={handleCancel}
                      disabled={updateMutation.isPending}
                    >
                      Cancel
                    </Button>
                    <Button
                      onClick={handleSave}
                      disabled={updateMutation.isPending}
                    >
                      <Save className="h-4 w-4 mr-2" />
                      {updateMutation.isPending ? "Saving..." : "Save"}
                    </Button>
                  </div>
                </>
              ) : (
                <div className="text-right">
                  <div className="flex items-baseline gap-2">
                    <span className="text-4xl font-bold text-primary">
                      R{settings?.price_per_km_cents ? (settings.price_per_km_cents / 100).toFixed(2) : "0.00"}
                    </span>
                    <span className="text-xl text-muted-foreground">/ km</span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    Current rate
                  </p>
                </div>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card className="bg-blue-50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-900">
              <CardContent className="pt-6">
                <div className="flex items-center gap-3 mb-2">
                  <Truck className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                  <CardTitle className="text-sm font-medium text-blue-900 dark:text-blue-100">
                    Example Calculation
                  </CardTitle>
                </div>
                <p className="text-sm text-blue-700 dark:text-blue-300">
                  For a 10km delivery:
                </p>
                <p className="text-2xl font-bold text-blue-900 dark:text-blue-100 mt-2">
                  R{settings?.price_per_km_cents ? ((settings.price_per_km_cents / 100) * 10).toFixed(2) : "0.00"}
                </p>
              </CardContent>
            </Card>

            <Card className="bg-green-50 dark:bg-green-950/20 border-green-200 dark:border-green-900">
              <CardContent className="pt-6">
                <div className="flex items-center gap-3 mb-2">
                  <TrendingUp className="h-5 w-5 text-green-600 dark:text-green-400" />
                  <CardTitle className="text-sm font-medium text-green-900 dark:text-green-100">
                    Impact
                  </CardTitle>
                </div>
                <p className="text-sm text-green-700 dark:text-green-300">
                  Applied to all new orders
                </p>
                <p className="text-xs text-green-600 dark:text-green-400 mt-2">
                  Changes take effect immediately
                </p>
              </CardContent>
            </Card>

            <Card className="bg-purple-50 dark:bg-purple-950/20 border-purple-200 dark:border-purple-900">
              <CardContent className="pt-6">
                <div className="flex items-center gap-3 mb-2">
                  <Activity className="h-5 w-5 text-purple-600 dark:text-purple-400" />
                  <CardTitle className="text-sm font-medium text-purple-900 dark:text-purple-100">
                    Last Updated
                  </CardTitle>
                </div>
                <p className="text-sm text-purple-700 dark:text-purple-300">
                  {settings?.updated_at
                    ? new Date(settings.updated_at).toLocaleDateString()
                    : "Never"}
                </p>
                <p className="text-xs text-purple-600 dark:text-purple-400 mt-2">
                  {settings?.updated_at
                    ? formatDistanceToNow(new Date(settings.updated_at), { addSuffix: true })
                    : ""}
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function AdminDashboard() {
  const { profile } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [userDialogOpen, setUserDialogOpen] = useState(false);
  const [userSearch, setUserSearch] = useState("");
  const [userRoleFilter, setUserRoleFilter] = useState<"all" | "customer" | "driver" | "supplier">("all");
  const [driverKycSearch, setDriverKycSearch] = useState("");
  const [supplierKycSearch, setSupplierKycSearch] = useState("");
  const [complianceSearch, setComplianceSearch] = useState("");
  const [selectedComplianceEntity, setSelectedComplianceEntity] = useState<{ type: "driver" | "supplier"; id: string } | null>(null);
  const [complianceDialogOpen, setComplianceDialogOpen] = useState(false);

  // Fetch pending KYC/KYB applications
  const { data: pendingKYC, isLoading } = useQuery<PendingKYC>({
    queryKey: ["/api/admin/kyc/pending"],
    enabled: !!profile && profile.role === "admin", // Only fetch if admin is logged in
  });

  // Fetch all customers
  const { data: customers, isLoading: customersLoading } = useQuery<Customer[]>({
    queryKey: ["/api/admin/customers"],
    enabled: !!profile && profile.role === "admin", // Only fetch if admin is logged in
  });

  // Fetch all suppliers
  const { data: allSuppliers, isLoading: suppliersLoading } = useQuery<Supplier[]>({
    queryKey: ["/api/admin/suppliers"],
    enabled: !!profile && profile.role === "admin", // Only fetch if admin is logged in
  });

  // Fetch all drivers
  const { data: allDrivers, isLoading: driversLoading } = useQuery<Driver[]>({
    queryKey: ["/api/admin/drivers"],
    enabled: !!profile && profile.role === "admin", // Only fetch if admin is logged in
  });

  // Fetch pending compliance reviews
  const { data: pendingCompliance } = useQuery<any>({
    queryKey: ["/api/admin/compliance/pending"],
    enabled: !!profile && profile.role === "admin", // Only fetch if admin is logged in
  });

  // Fetch compliance checklist for selected entity
  const { data: complianceChecklist } = useQuery<any>({
    queryKey: ["/api/admin/compliance", selectedComplianceEntity?.type, selectedComplianceEntity?.id, "checklist"],
    enabled: !!selectedComplianceEntity,
  });

  // Fetch notifications
  const { data: notifications = [] } = useQuery<any[]>({
    queryKey: ["/api/notifications"],
    enabled: !!profile && profile.role === "admin", // Only fetch if admin is logged in
    refetchInterval: 30000, // Refetch every 30 seconds as fallback (WebSocket handles real-time)
    staleTime: 0, // Always consider data stale - refetch immediately when invalidated
    gcTime: 0, // Don't cache - always fetch fresh data
    refetchOnMount: true, // Always refetch when component mounts (e.g., after login)
    refetchOnWindowFocus: true, // Refetch when window regains focus
    retry: false, // Don't retry on errors
  });

  // Filter admin-related notifications
  const adminNotifications = notifications.filter(
    (n) => n.type === "admin_document_uploaded" || n.type === "admin_kyc_submitted"
  );

  // Handler for admin notification clicks
  const handleAdminNotificationClick = async (notification: any) => {
    try {
      let userId: string | null = null;

      if (notification.type === "admin_kyc_submitted") {
        // For KYC submissions, userId is directly in the data
        userId = notification.data?.userId;
      } else if (notification.type === "admin_document_uploaded") {
        // For document uploads, userId should now be in the data (after backend update)
        userId = notification.data?.userId;
        
        // Fallback: if userId is not in data, try to find by name
        if (!userId) {
          const ownerType = notification.data?.ownerType;
          const ownerName = notification.data?.ownerName;
          
          if (ownerType === "driver" && ownerName) {
            const matchingDriver = allDrivers?.find(
              (d) => d.profiles?.full_name === ownerName
            );
            if (matchingDriver) {
              userId = matchingDriver.user_id;
            }
          } else if (ownerType === "supplier" && ownerName) {
            const matchingSupplier = allSuppliers?.find(
              (s) => s.profiles?.full_name === ownerName || s.name === ownerName
            );
            if (matchingSupplier) {
              userId = matchingSupplier.owner_id;
            }
          }
        }
      }

      if (userId) {
        setSelectedUserId(userId);
        setUserDialogOpen(true);
      } else {
        toast({
          title: "Error",
          description: "Could not find user information for this notification. Please search for the user manually.",
          variant: "destructive",
        });
      }
    } catch (error: any) {
      console.error("[AdminDashboard] Error handling notification click:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to open user details",
        variant: "destructive",
      });
    }
  };

  // Listen for real-time updates via WebSocket
  useWebSocket((message) => {
    console.log("[AdminDashboard] WebSocket message received:", message.type, message);
    
    if (message.type === "kyc_submitted" || message.type === "kyc_approved" || message.type === "kyc_rejected") {
      // Refresh KYC pending list when applications are submitted or reviewed
      console.log("[AdminDashboard] Invalidating KYC pending due to:", message.type);
      queryClient.invalidateQueries({ queryKey: ["/api/admin/kyc/pending"] });
    }
    
    if (message.type === "user_created" || message.type === "user_updated" || message.type === "kyc_approved" || message.type === "kyc_rejected") {
      // Refresh user lists when users are created/updated or KYC status changes
      console.log("[AdminDashboard] Invalidating user lists due to:", message.type);
      queryClient.invalidateQueries({ queryKey: ["/api/admin/customers"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/drivers"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/suppliers"] });
    }
  });

  // Approve driver mutation
  const approveDriverMutation = useMutation({
    mutationFn: async (driverId: string) => {
      return apiRequest("POST", `/api/admin/kyc/driver/${driverId}/approve`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/kyc/pending"] });
      toast({
        title: "Success",
        description: "Driver KYC approved successfully",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to approve driver KYC",
        variant: "destructive",
      });
    },
  });

  // Reject driver mutation
  const rejectDriverMutation = useMutation({
    mutationFn: async (driverId: string) => {
      return apiRequest("POST", `/api/admin/kyc/driver/${driverId}/reject`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/kyc/pending"] });
      toast({
        title: "Success",
        description: "Driver KYC rejected",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to reject driver KYC",
        variant: "destructive",
      });
    },
  });

  // Approve supplier mutation
  const approveSupplierMutation = useMutation({
    mutationFn: async (supplierId: string) => {
      return apiRequest("POST", `/api/admin/kyc/supplier/${supplierId}/approve`);
    },
    onSuccess: (data, supplierId) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/kyc/pending"] });
      // Also invalidate all user details queries to refresh status in dialogs
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      toast({
        title: "Success",
        description: "Supplier KYB approved successfully",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to approve supplier KYB",
        variant: "destructive",
      });
    },
  });

  // Reject supplier mutation
  const rejectSupplierMutation = useMutation({
    mutationFn: async (supplierId: string) => {
      return apiRequest("POST", `/api/admin/kyc/supplier/${supplierId}/reject`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/kyc/pending"] });
      toast({
        title: "Success",
        description: "Supplier KYB rejected",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to reject supplier KYB",
        variant: "destructive",
      });
    },
  });

  const driverKYC = pendingKYC?.drivers?.map(driver => ({
    id: driver.id,
    userId: driver.user_id,
    applicantName: driver.profiles.full_name,
    applicantType: "driver" as const,
    documentType: driver.vehicle_registration || "Driver Application",
    submittedDate: new Date(driver.created_at).toLocaleString(),
    status: "pending" as const,
  })) || [];

  const supplierKYC = pendingKYC?.suppliers?.map(supplier => ({
    id: supplier.id,
    userId: supplier.owner_id,
    applicantName: supplier.name,
    applicantType: "supplier" as const,
    documentType: "Company Registration",
    submittedDate: new Date(supplier.created_at).toLocaleString(),
    status: "pending" as const,
  })) || [];

  const handleDriverApprove = (id: string) => {
    approveDriverMutation.mutate(id);
  };

  const handleDriverReject = (id: string) => {
    rejectDriverMutation.mutate(id);
  };

  const handleSupplierApprove = (id: string) => {
    approveSupplierMutation.mutate(id);
  };

  const handleSupplierReject = (id: string) => {
    rejectSupplierMutation.mutate(id);
  };

  const handleView = (userId: string, type: string) => {
    setSelectedUserId(userId);
    setUserDialogOpen(true);
  };

  // Filter customers based on search and ensure they have role "customer"
  // Combine all users into a single array with role information
  // Only include users where profiles.role matches their actual role
  // Use a Map to deduplicate by user_id/owner_id to prevent showing the same user twice
  const usersMap = new Map<string, any>();
  
  // Add customers (only those with role === "customer")
  customers?.filter(customer => customer.profiles?.role === "customer").forEach(customer => {
    const key = customer.user_id;
    if (!usersMap.has(key)) {
      usersMap.set(key, { ...customer, userRole: "customer" as const });
    }
  });
  
  // Add drivers (only those with role === "driver")
  allDrivers?.filter(driver => driver.profiles?.role === "driver").forEach(driver => {
    const key = driver.user_id;
    // Only add if not already added as a customer
    if (!usersMap.has(key)) {
      usersMap.set(key, { ...driver, userRole: "driver" as const });
    }
  });
  
  // Add suppliers (only those with role === "supplier")
  allSuppliers?.filter(supplier => supplier.profiles?.role === "supplier").forEach(supplier => {
    const key = supplier.owner_id;
    // Only add if not already added as a customer or driver
    if (!usersMap.has(key)) {
      usersMap.set(key, { ...supplier, userRole: "supplier" as const });
    }
  });
  
  const allUsers = Array.from(usersMap.values());

  // Filter users based on search and role filter
  const filteredUsers = allUsers.filter((user) => {
    // Apply role filter
    if (userRoleFilter !== "all" && user.userRole !== userRoleFilter) {
      return false;
    }

    // Apply search filter
    const searchLower = userSearch.toLowerCase();
    if (user.userRole === "customer") {
      return (
        user.profiles?.full_name?.toLowerCase().includes(searchLower) ||
        user.company_name?.toLowerCase().includes(searchLower) ||
        user.profiles?.email?.toLowerCase().includes(searchLower) ||
        user.profiles?.phone?.toLowerCase().includes(searchLower)
      );
    } else if (user.userRole === "driver") {
      return (
        user.profiles?.full_name?.toLowerCase().includes(searchLower) ||
        user.vehicle_registration?.toLowerCase().includes(searchLower) ||
        user.profiles?.email?.toLowerCase().includes(searchLower) ||
        user.profiles?.phone?.toLowerCase().includes(searchLower)
      );
    } else if (user.userRole === "supplier") {
      return (
        user.name?.toLowerCase().includes(searchLower) ||
        user.profiles?.full_name?.toLowerCase().includes(searchLower) ||
        user.profiles?.email?.toLowerCase().includes(searchLower) ||
        user.profiles?.phone?.toLowerCase().includes(searchLower)
      );
    }
    return false;
  });

  // Keep filteredCustomers for stats (legacy)
  const filteredCustomers = customers?.filter((customer) => {
    if (customer.profiles?.role !== "customer") {
      return false;
    }
    return (
      customer.profiles?.full_name?.toLowerCase().includes(userSearch.toLowerCase()) ||
      customer.company_name?.toLowerCase().includes(userSearch.toLowerCase())
    );
  }) || [];

  // Filter driver KYC based on search
  const filteredDriverKYC = driverKYC.filter((driver) =>
    driver.applicantName.toLowerCase().includes(driverKycSearch.toLowerCase())
  );

  // Filter supplier KYC based on search
  const filteredSupplierKYC = supplierKYC.filter((supplier) =>
    supplier.applicantName.toLowerCase().includes(supplierKycSearch.toLowerCase())
  );

  if (isLoading || customersLoading || driversLoading || suppliersLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
          <p className="mt-4 text-muted-foreground">Loading admin dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <AppHeader onAdminNotificationClick={handleAdminNotificationClick} />
      
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold mb-2">Admin Dashboard</h1>
            <p className="text-muted-foreground">Monitor platform operations and manage verifications</p>
          </div>
          <CreateUserDialog />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <StatsCard
            title="Total Users"
            value={allUsers.length}
            description="Registered accounts"
            icon={Users}
          />
          <StatsCard
            title="Pending Driver KYC"
            value={driverKYC.length}
            description="Awaiting review"
            icon={Truck}
          />
          <StatsCard
            title="Pending Supplier KYC"
            value={supplierKYC.length}
            description="Awaiting review"
            icon={Building2}
          />
          <StatsCard
            title="Total Pending"
            value={driverKYC.length + supplierKYC.length}
            description="All KYC/KYB reviews"
            icon={UserCheck}
          />
        </div>

        <Tabs defaultValue="activity" className="space-y-6">
          <div className="overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0">
            <TabsList className="min-w-max">
              <TabsTrigger value="activity" data-testid="tab-activity">
                Activity
              </TabsTrigger>
              <TabsTrigger value="users" data-testid="tab-users">
                Users ({allUsers.length})
              </TabsTrigger>
              <TabsTrigger value="driver-kyc" data-testid="tab-driver-kyc">
                Driver KYC ({driverKYC.length})
              </TabsTrigger>
              <TabsTrigger value="supplier-kyc" data-testid="tab-supplier-kyc">
                Supplier KYC ({supplierKYC.length})
              </TabsTrigger>
              <TabsTrigger value="compliance-review" data-testid="tab-compliance-review">
                Compliance Review ({pendingCompliance ? (pendingCompliance.drivers?.length || 0) + (pendingCompliance.suppliers?.length || 0) : 0})
              </TabsTrigger>
              <TabsTrigger value="settings" data-testid="tab-settings">Settings</TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="activity" className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <BarChart3 className="h-5 w-5" />
                    User Activity by Role
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="h-[300px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={[
                            {
                              name: "Customers",
                              value: filteredCustomers.length,
                              fill: "hsl(var(--chart-1))",
                            },
                            {
                              name: "Drivers",
                              value: allDrivers?.filter(d => d.profiles?.role === "driver").length || 0,
                              fill: "hsl(var(--chart-2))",
                            },
                            {
                              name: "Suppliers",
                              value: allSuppliers?.filter(s => s.profiles?.role === "supplier").length || 0,
                              fill: "hsl(var(--chart-3))",
                            },
                          ]}
                          cx="50%"
                          cy="50%"
                          labelLine={false}
                          label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                          outerRadius={80}
                          innerRadius={50}
                          dataKey="value"
                        >
                          {[
                            { fill: "hsl(var(--chart-1))" },
                            { fill: "hsl(var(--chart-2))" },
                            { fill: "hsl(var(--chart-3))" },
                          ].map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.fill} />
                          ))}
                        </Pie>
                        <Tooltip 
                          contentStyle={{
                            backgroundColor: "hsl(var(--background))",
                            border: "1px solid hsl(var(--border))",
                            borderRadius: "6px",
                          }}
                          labelStyle={{ color: "hsl(var(--foreground))" }}
                        />
                        <Legend 
                          verticalAlign="bottom" 
                          height={36}
                          formatter={(value) => <span style={{ color: "hsl(var(--foreground))" }}>{value}</span>}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Activity className="h-5 w-5" />
                    Platform Activity Overview
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="flex items-center justify-between p-3 border rounded-lg">
                      <div className="flex items-center gap-3">
                        <Users className="h-5 w-5 text-blue-600" />
                        <div>
                          <p className="font-medium">User Registrations</p>
                          <p className="text-sm text-muted-foreground">New users this month</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="font-bold text-lg">-</p>
                        <p className="text-xs text-muted-foreground flex items-center gap-1">
                          <ArrowUpRight className="h-3 w-3" />
                          -
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center justify-between p-3 border rounded-lg">
                      <div className="flex items-center gap-3">
                        <Truck className="h-5 w-5 text-green-600" />
                        <div>
                          <p className="font-medium">Driver Activity</p>
                          <p className="text-sm text-muted-foreground">Active drivers</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="font-bold text-lg">{allDrivers?.filter(d => d.profiles?.role === "driver").length || 0}</p>
                        <p className="text-xs text-muted-foreground">Total drivers</p>
                      </div>
                    </div>
                    <div className="flex items-center justify-between p-3 border rounded-lg">
                      <div className="flex items-center gap-3">
                        <Building2 className="h-5 w-5 text-purple-600" />
                        <div>
                          <p className="font-medium">Supplier Activity</p>
                          <p className="text-sm text-muted-foreground">Active suppliers</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="font-bold text-lg">{allSuppliers?.filter(s => s.profiles?.role === "supplier").length || 0}</p>
                        <p className="text-xs text-muted-foreground">Total suppliers</p>
                      </div>
                    </div>
                    <div className="flex items-center justify-between p-3 border rounded-lg">
                      <div className="flex items-center gap-3">
                        <Users className="h-5 w-5 text-orange-600" />
                        <div>
                          <p className="font-medium">Customer Activity</p>
                          <p className="text-sm text-muted-foreground">Active customers</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="font-bold text-lg">{allUsers.filter(u => u.userRole === "customer").length}</p>
                        <p className="text-xs text-muted-foreground">Total users</p>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <TrendingUp className="h-5 w-5" />
                  Activity Trends
                </CardTitle>
              </CardHeader>
              <CardContent>
                {adminNotifications.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <Bell className="h-12 w-12 mx-auto mb-3 opacity-50" />
                    <p>No recent activity</p>
                    <p className="text-xs mt-1">Activity notifications will appear here</p>
                  </div>
                ) : (
                  <div className="space-y-3 max-h-[400px] overflow-y-auto">
                    {adminNotifications.slice(0, 20).map((notification) => {
                      const timeAgo = formatDistanceToNow(new Date(notification.created_at || notification.createdAt), { addSuffix: true });
                      const isKYC = notification.type === "admin_kyc_submitted";
                      const isDocument = notification.type === "admin_document_uploaded";
                      
                      return (
                        <div
                          key={notification.id}
                          onClick={() => handleAdminNotificationClick(notification)}
                          className={`p-4 border rounded-lg cursor-pointer transition-colors ${
                            !notification.read
                              ? "bg-primary/5 border-primary/20 hover:bg-primary/10"
                              : "hover:bg-muted/50"
                          }`}
                        >
                          <div className="flex items-start gap-3">
                            <div className="text-2xl flex-shrink-0">
                              {isKYC ? (
                                <UserCheck className="h-5 w-5 text-blue-600" />
                              ) : isDocument ? (
                                <FileText className="h-5 w-5 text-green-600" />
                              ) : (
                                <Bell className="h-5 w-5 text-muted-foreground" />
                              )}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-start justify-between gap-2">
                                <p className={`text-sm font-medium ${!notification.read ? "font-semibold" : ""}`}>
                                  {notification.title}
                                </p>
                                {!notification.read && (
                                  <div className="h-2 w-2 rounded-full bg-primary flex-shrink-0 mt-1.5" />
                                )}
                              </div>
                              <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                                {notification.message}
                              </p>
                              <p className="text-xs text-muted-foreground mt-2">
                                {timeAgo}
                              </p>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="users" className="space-y-4">
            <div className="flex flex-col sm:flex-row gap-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search users by name, email, phone, or company..."
                  className="pl-10"
                  value={userSearch}
                  onChange={(e) => setUserSearch(e.target.value)}
                  data-testid="input-search-users"
                />
              </div>
              <div className="flex items-center gap-2">
                <Filter className="h-4 w-4 text-muted-foreground" />
                <Select value={userRoleFilter} onValueChange={(value: "all" | "customer" | "driver" | "supplier") => setUserRoleFilter(value)}>
                  <SelectTrigger className="w-[180px]">
                    <SelectValue placeholder="Filter by role" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Users</SelectItem>
                    <SelectItem value="customer">Customers</SelectItem>
                    <SelectItem value="driver">Drivers</SelectItem>
                    <SelectItem value="supplier">Suppliers</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            {allUsers.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <p>No users registered yet</p>
              </div>
            ) : filteredUsers.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <p>No users match your search or filter</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {filteredUsers.map((user) => {
                  if (user.userRole === "customer") {
                    return (
                      <CustomerCard
                        key={user.id}
                        id={user.id}
                        name={user.profiles?.full_name || 'N/A'}
                        companyName={user.company_name}
                        email={user.profiles?.email}
                        vatNumber={user.vat_number}
                        phone={user.profiles?.phone}
                        registeredDate={new Date(user.created_at).toLocaleDateString()}
                        profilePhotoUrl={user.profiles?.profile_photo_url}
                        onView={() => handleView(user.user_id, "customer")}
                      />
                    );
                  } else if (user.userRole === "driver") {
                    const primaryVehicle = user.vehicles?.[0];
                    const vehicleType = primaryVehicle 
                      ? `${primaryVehicle.make || ''} ${primaryVehicle.model || ''}`.trim() || primaryVehicle.registration_number
                      : undefined;
                    
                    return (
                      <DriverCard
                        key={user.id}
                        id={user.id}
                        name={user.profiles?.full_name || 'N/A'}
                        companyName={user.company_name}
                        email={user.profiles?.email}
                        vehicleRegistration={user.vehicle_registration}
                        vehicleType={vehicleType}
                        fuelCapacity={primaryVehicle?.capacity_litres}
                        kycStatus={user.kyc_status}
                        phone={user.profiles?.phone}
                        registeredDate={new Date(user.created_at).toLocaleDateString()}
                        profilePhotoUrl={user.profiles?.profile_photo_url}
                        onView={() => handleView(user.user_id, "driver")}
                      />
                    );
                  } else if (user.userRole === "supplier") {
                    return (
                      <SupplierCard
                        key={user.id}
                        id={user.id}
                        name={user.profiles?.full_name || 'N/A'}
                        companyName={user.name}
                        email={user.profiles?.email}
                        kybStatus={user.kyb_status}
                        cipcNumber={user.cipc_number}
                        phone={user.profiles?.phone}
                        registeredDate={new Date(user.created_at).toLocaleDateString()}
                        profilePhotoUrl={user.profiles?.profile_photo_url}
                        onView={() => handleView(user.owner_id, "supplier")}
                      />
                    );
                  }
                  return null;
                })}
              </div>
            )}
          </TabsContent>

          <TabsContent value="driver-kyc" className="space-y-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search drivers by name..."
                className="pl-10"
                value={driverKycSearch}
                onChange={(e) => setDriverKycSearch(e.target.value)}
                data-testid="input-search-driver-kyc"
              />
            </div>
            {driverKYC.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <p>No pending driver KYC applications</p>
              </div>
            ) : filteredDriverKYC.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <p>No drivers match your search</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {filteredDriverKYC.map((doc) => (
                  <KYCDocumentCard
                    key={doc.id}
                    {...doc}
                    onApprove={() => handleDriverApprove(doc.id)}
                    onReject={() => handleDriverReject(doc.id)}
                    onView={() => handleView(doc.userId, "driver")}
                  />
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="supplier-kyc" className="space-y-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search suppliers by name..."
                className="pl-10"
                value={supplierKycSearch}
                onChange={(e) => setSupplierKycSearch(e.target.value)}
                data-testid="input-search-supplier-kyc"
              />
            </div>
            {supplierKYC.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <p>No pending supplier KYB applications</p>
              </div>
            ) : filteredSupplierKYC.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <p>No suppliers match your search</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {filteredSupplierKYC.map((doc) => (
                  <KYCDocumentCard
                    key={doc.id}
                    {...doc}
                    onApprove={() => handleSupplierApprove(doc.id)}
                    onReject={() => handleSupplierReject(doc.id)}
                    onView={() => handleView(doc.userId, "supplier")}
                  />
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="compliance-review" className="space-y-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by name..."
                className="pl-10"
                value={complianceSearch}
                onChange={(e) => setComplianceSearch(e.target.value)}
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Pending Drivers */}
              {pendingCompliance?.drivers
                ?.filter((d: any) => 
                  d.profiles?.full_name?.toLowerCase().includes(complianceSearch.toLowerCase())
                )
                .map((driver: any) => (
                  <Card key={driver.id} className="relative">
                    <CardHeader>
                      <div className="flex items-start justify-between">
                        <div>
                          <CardTitle className="text-lg">{driver.profiles?.full_name || "Unknown"}</CardTitle>
                          <CardDescription>Driver Compliance Review</CardDescription>
                        </div>
                        <Badge variant="secondary">
                          {driver.compliance_status === "pending" ? "Pending" : "Incomplete"}
                        </Badge>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div className="text-sm space-y-1">
                        <p><span className="text-muted-foreground">Status:</span> {driver.status}</p>
                        <p><span className="text-muted-foreground">Compliance:</span> {driver.compliance_status}</p>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setSelectedComplianceEntity({ type: "driver", id: driver.id });
                            setComplianceDialogOpen(true);
                          }}
                        >
                          <Eye className="h-4 w-4 mr-2" />
                          Review
                        </Button>
                        <Button
                          variant="default"
                          size="sm"
                          onClick={async () => {
                            try {
                              await apiRequest("POST", `/api/admin/compliance/driver/${driver.id}/approve`);
                              queryClient.invalidateQueries({ queryKey: ["/api/admin/compliance/pending"] });
                              toast({
                                title: "Success",
                                description: "Driver compliance approved",
                              });
                            } catch (error: any) {
                              toast({
                                title: "Error",
                                description: error.message || "Failed to approve compliance",
                                variant: "destructive",
                              });
                            }
                          }}
                        >
                          <CheckCircle2 className="h-4 w-4 mr-2" />
                          Approve
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}

              {/* Pending Suppliers */}
              {pendingCompliance?.suppliers
                ?.filter((s: any) => 
                  s.name?.toLowerCase().includes(complianceSearch.toLowerCase()) ||
                  s.profiles?.full_name?.toLowerCase().includes(complianceSearch.toLowerCase())
                )
                .map((supplier: any) => (
                  <Card key={supplier.id} className="relative">
                    <CardHeader>
                      <div className="flex items-start justify-between">
                        <div>
                          <CardTitle className="text-lg">{supplier.name || supplier.profiles?.full_name || "Unknown"}</CardTitle>
                          <CardDescription>Supplier Compliance Review</CardDescription>
                        </div>
                        <Badge variant="secondary">
                          {supplier.compliance_status === "pending" ? "Pending" : "Incomplete"}
                        </Badge>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div className="text-sm space-y-1">
                        <p><span className="text-muted-foreground">Status:</span> {supplier.status}</p>
                        <p><span className="text-muted-foreground">Compliance:</span> {supplier.compliance_status}</p>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setSelectedComplianceEntity({ type: "supplier", id: supplier.id });
                            setComplianceDialogOpen(true);
                          }}
                        >
                          <Eye className="h-4 w-4 mr-2" />
                          Review
                        </Button>
                        <Button
                          variant="default"
                          size="sm"
                          onClick={async () => {
                            try {
                              await apiRequest("POST", `/api/admin/compliance/supplier/${supplier.id}/approve`);
                              queryClient.invalidateQueries({ queryKey: ["/api/admin/compliance/pending"] });
                              toast({
                                title: "Success",
                                description: "Supplier compliance approved",
                              });
                            } catch (error: any) {
                              toast({
                                title: "Error",
                                description: error.message || "Failed to approve compliance",
                                variant: "destructive",
                              });
                            }
                          }}
                        >
                          <CheckCircle2 className="h-4 w-4 mr-2" />
                          Approve
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
            </div>

            {(!pendingCompliance || 
              ((pendingCompliance.drivers?.length || 0) + (pendingCompliance.suppliers?.length || 0) === 0)) && (
              <div className="text-center py-12 text-muted-foreground">
                <Shield className="h-12 w-12 mx-auto mb-3 opacity-50" />
                <p>No pending compliance reviews</p>
              </div>
            )}
          </TabsContent>

          <TabsContent value="settings" className="space-y-6">
            <div>
              <h2 className="text-2xl font-bold mb-2">Platform Settings</h2>
              <p className="text-muted-foreground">Manage system-wide configuration and pricing</p>
            </div>

            <DeliveryFeeSettings />
          </TabsContent>
        </Tabs>
      </main>

      <UserDetailsDialogEnhanced
        userId={selectedUserId}
        open={userDialogOpen}
        onOpenChange={setUserDialogOpen}
      />

      {/* Compliance Review Dialog */}
      {selectedComplianceEntity && (
        <Dialog open={complianceDialogOpen} onOpenChange={setComplianceDialogOpen}>
          <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Shield className="h-5 w-5" />
                Compliance Review - {selectedComplianceEntity.type === "driver" ? "Driver" : "Supplier"}
              </DialogTitle>
              <DialogDescription>
                Review compliance documents and checklist
              </DialogDescription>
            </DialogHeader>

            {complianceChecklist && (
              <div className="space-y-6">
                {/* Compliance Status Overview */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">Compliance Status</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="flex items-center justify-between">
                      <span className="font-medium">Overall Status</span>
                      <Badge 
                        variant={
                          complianceChecklist.overallStatus === "approved" ? "default" :
                          complianceChecklist.overallStatus === "rejected" ? "destructive" :
                          "secondary"
                        }
                      >
                        {complianceChecklist.overallStatus === "approved" ? "Approved" :
                         complianceChecklist.overallStatus === "rejected" ? "Rejected" :
                         complianceChecklist.overallStatus === "pending" ? "Pending Review" :
                         "Incomplete"}
                      </Badge>
                    </div>

                    {complianceChecklist.checklist && (
                      <>
                        <div>
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-sm font-medium">Document Progress</span>
                            <span className="text-sm text-muted-foreground">
                              {complianceChecklist.checklist.approved.length} / {complianceChecklist.checklist.required.length} approved
                            </span>
                          </div>
                          <Progress 
                            value={
                              (complianceChecklist.checklist.approved.length / complianceChecklist.checklist.required.length) * 100
                            } 
                            className="h-2"
                          />
                        </div>

                        {complianceChecklist.checklist.missing.length > 0 && (
                          <Alert>
                            <AlertTriangle className="h-4 w-4" />
                            <AlertTitle>Missing Documents</AlertTitle>
                            <AlertDescription>
                              {complianceChecklist.checklist.missing.join(", ")}
                            </AlertDescription>
                          </Alert>
                        )}

                        {complianceChecklist.checklist.pending.length > 0 && (
                          <Alert>
                            <AlertTriangle className="h-4 w-4" />
                            <AlertTitle>Pending Review</AlertTitle>
                            <AlertDescription>
                              {complianceChecklist.checklist.pending.length} document(s) awaiting review
                            </AlertDescription>
                          </Alert>
                        )}
                      </>
                    )}

                    {complianceChecklist.rejectionReason && (
                      <Alert variant="destructive">
                        <AlertTriangle className="h-4 w-4" />
                        <AlertTitle>Rejection Reason</AlertTitle>
                        <AlertDescription>
                          {complianceChecklist.rejectionReason}
                        </AlertDescription>
                      </Alert>
                    )}
                  </CardContent>
                </Card>

                {/* Compliance Checklist */}
                {complianceChecklist.checklist && (
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-lg">Compliance Checklist</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-2">
                        {complianceChecklist.checklist.required.map((docType: string) => {
                          const isApproved = complianceChecklist.checklist.approved.includes(docType);
                          const isPending = complianceChecklist.checklist.pending.includes(docType);
                          const isRejected = complianceChecklist.checklist.rejected.includes(docType);
                          const isMissing = complianceChecklist.checklist.missing.includes(docType);

                          return (
                            <div key={docType} className="flex items-center justify-between p-3 border rounded-lg">
                              <div className="flex items-center gap-3">
                                {isApproved ? (
                                  <CheckCircle2 className="h-5 w-5 text-green-600" />
                                ) : isRejected ? (
                                  <XCircle className="h-5 w-5 text-red-600" />
                                ) : isPending ? (
                                  <FileText className="h-5 w-5 text-yellow-600" />
                                ) : (
                                  <FileText className="h-5 w-5 text-muted-foreground" />
                                )}
                                <span className="font-medium">{docType.replace(/_/g, " ").replace(/\b\w/g, l => l.toUpperCase())}</span>
                              </div>
                              <Badge 
                                variant={
                                  isApproved ? "default" :
                                  isRejected ? "destructive" :
                                  isPending ? "secondary" :
                                  "outline"
                                }
                              >
                                {isApproved ? "Approved" :
                                 isRejected ? "Rejected" :
                                 isPending ? "Pending" :
                                 "Missing"}
                              </Badge>
                            </div>
                          );
                        })}
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* Action Buttons */}
                <div className="flex gap-2 justify-end">
                  <Button
                    variant="outline"
                    onClick={() => {
                      setComplianceDialogOpen(false);
                      setSelectedComplianceEntity(null);
                    }}
                  >
                    Close
                  </Button>
                  <Button
                    variant="destructive"
                    onClick={async () => {
                      const reason = prompt("Please provide a reason for rejection:");
                      if (!reason) return;

                      try {
                        const endpoint = selectedComplianceEntity.type === "driver"
                          ? `/api/admin/compliance/driver/${selectedComplianceEntity.id}/reject`
                          : `/api/admin/compliance/supplier/${selectedComplianceEntity.id}/reject`;
                        
                        await apiRequest("POST", endpoint, { reason });
                        queryClient.invalidateQueries({ queryKey: ["/api/admin/compliance/pending"] });
                        queryClient.invalidateQueries({ queryKey: ["/api/admin/compliance", selectedComplianceEntity.type, selectedComplianceEntity.id, "checklist"] });
                        setComplianceDialogOpen(false);
                        setSelectedComplianceEntity(null);
                        toast({
                          title: "Success",
                          description: "Compliance rejected",
                        });
                      } catch (error: any) {
                        toast({
                          title: "Error",
                          description: error.message || "Failed to reject compliance",
                          variant: "destructive",
                        });
                      }
                    }}
                  >
                    <XCircle className="h-4 w-4 mr-2" />
                    Reject
                  </Button>
                  <Button
                    onClick={async () => {
                      try {
                        const endpoint = selectedComplianceEntity.type === "driver"
                          ? `/api/admin/compliance/driver/${selectedComplianceEntity.id}/approve`
                          : `/api/admin/compliance/supplier/${selectedComplianceEntity.id}/approve`;
                        
                        await apiRequest("POST", endpoint);
                        queryClient.invalidateQueries({ queryKey: ["/api/admin/compliance/pending"] });
                        queryClient.invalidateQueries({ queryKey: ["/api/admin/compliance", selectedComplianceEntity.type, selectedComplianceEntity.id, "checklist"] });
                        setComplianceDialogOpen(false);
                        setSelectedComplianceEntity(null);
                        toast({
                          title: "Success",
                          description: "Compliance approved",
                        });
                      } catch (error: any) {
                        toast({
                          title: "Error",
                          description: error.message || "Failed to approve compliance",
                          variant: "destructive",
                        });
                      }
                    }}
                  >
                    <CheckCircle2 className="h-4 w-4 mr-2" />
                    Approve
                  </Button>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
