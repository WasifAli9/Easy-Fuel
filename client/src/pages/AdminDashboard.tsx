import { useState } from "react";
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
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Users, Truck, TrendingUp, Building2, UserCheck, Search, Shield, FileText, CheckCircle2, XCircle, Eye } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useWebSocket } from "@/hooks/useWebSocket";

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

export default function AdminDashboard() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [userDialogOpen, setUserDialogOpen] = useState(false);
  const [customerSearch, setCustomerSearch] = useState("");
  const [allDriversSearch, setAllDriversSearch] = useState("");
  const [allSuppliersSearch, setAllSuppliersSearch] = useState("");
  const [driverKycSearch, setDriverKycSearch] = useState("");
  const [supplierKycSearch, setSupplierKycSearch] = useState("");
  const [complianceSearch, setComplianceSearch] = useState("");
  const [selectedComplianceEntity, setSelectedComplianceEntity] = useState<{ type: "driver" | "supplier"; id: string } | null>(null);
  const [complianceDialogOpen, setComplianceDialogOpen] = useState(false);

  // Fetch pending KYC/KYB applications
  const { data: pendingKYC, isLoading } = useQuery<PendingKYC>({
    queryKey: ["/api/admin/kyc/pending"],
  });

  // Fetch all customers
  const { data: customers, isLoading: customersLoading } = useQuery<Customer[]>({
    queryKey: ["/api/admin/customers"],
  });

  // Fetch all suppliers
  const { data: allSuppliers, isLoading: suppliersLoading } = useQuery<Supplier[]>({
    queryKey: ["/api/admin/suppliers"],
  });

  // Fetch all drivers
  const { data: allDrivers, isLoading: driversLoading } = useQuery<Driver[]>({
    queryKey: ["/api/admin/drivers"],
  });

  // Fetch pending compliance reviews
  const { data: pendingCompliance } = useQuery<any>({
    queryKey: ["/api/admin/compliance/pending"],
  });

  // Fetch compliance checklist for selected entity
  const { data: complianceChecklist } = useQuery<any>({
    queryKey: ["/api/admin/compliance", selectedComplianceEntity?.type, selectedComplianceEntity?.id, "checklist"],
    enabled: !!selectedComplianceEntity,
  });

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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/kyc/pending"] });
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

  // Filter customers based on search
  const filteredCustomers = customers?.filter((customer) =>
    customer.profiles?.full_name?.toLowerCase().includes(customerSearch.toLowerCase()) ||
    customer.company_name?.toLowerCase().includes(customerSearch.toLowerCase())
  ) || [];

  // Filter all drivers based on search
  const filteredAllDrivers = allDrivers?.filter((driver) =>
    driver.profiles?.full_name?.toLowerCase().includes(allDriversSearch.toLowerCase()) ||
    driver.vehicle_registration?.toLowerCase().includes(allDriversSearch.toLowerCase())
  ) || [];

  // Filter all suppliers based on search
  const filteredAllSuppliers = allSuppliers?.filter((supplier) =>
    supplier.name.toLowerCase().includes(allSuppliersSearch.toLowerCase()) ||
    supplier.profiles?.full_name?.toLowerCase().includes(allSuppliersSearch.toLowerCase())
  ) || [];

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
      <AppHeader notificationCount={driverKYC.length + supplierKYC.length} />
      
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
            title="Total Customers"
            value={customers?.length || 0}
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

        <Tabs defaultValue="customers" className="space-y-6">
          <div className="overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0">
            <TabsList className="min-w-max">
              <TabsTrigger value="customers" data-testid="tab-customers">
                Customers ({customers?.length || 0})
              </TabsTrigger>
              <TabsTrigger value="drivers" data-testid="tab-drivers">
                Drivers ({allDrivers?.length || 0})
              </TabsTrigger>
              <TabsTrigger value="suppliers" data-testid="tab-suppliers">
                Suppliers ({allSuppliers?.length || 0})
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

          <TabsContent value="customers" className="space-y-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search customers by name or company..."
                className="pl-10"
                value={customerSearch}
                onChange={(e) => setCustomerSearch(e.target.value)}
                data-testid="input-search-customers"
              />
            </div>
            {!customers || customers.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <p>No customers registered yet</p>
              </div>
            ) : filteredCustomers.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <p>No customers match your search</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {filteredCustomers.map((customer) => (
                  <CustomerCard
                    key={customer.id}
                    id={customer.id}
                    name={customer.profiles?.full_name || 'N/A'}
                    companyName={customer.company_name}
                    email={customer.profiles?.email}
                    vatNumber={customer.vat_number}
                    phone={customer.profiles?.phone}
                    registeredDate={new Date(customer.created_at).toLocaleDateString()}
                    profilePhotoUrl={customer.profiles?.profile_photo_url}
                    onView={() => handleView(customer.user_id, "customer")}
                  />
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="drivers" className="space-y-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search drivers by name or vehicle..."
                className="pl-10"
                value={allDriversSearch}
                onChange={(e) => setAllDriversSearch(e.target.value)}
                data-testid="input-search-all-drivers"
              />
            </div>
            {!allDrivers || allDrivers.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <p>No drivers registered yet</p>
              </div>
            ) : filteredAllDrivers.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <p>No drivers match your search</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {filteredAllDrivers.map((driver) => {
                  const primaryVehicle = driver.vehicles?.[0];
                  const vehicleType = primaryVehicle 
                    ? `${primaryVehicle.make || ''} ${primaryVehicle.model || ''}`.trim() || primaryVehicle.registration_number
                    : undefined;
                  
                  return (
                    <DriverCard
                      key={driver.id}
                      id={driver.id}
                      name={driver.profiles?.full_name || 'N/A'}
                      companyName={driver.company_name}
                      email={driver.profiles?.email}
                      vehicleRegistration={driver.vehicle_registration}
                      vehicleType={vehicleType}
                      fuelCapacity={primaryVehicle?.capacity_litres}
                      kycStatus={driver.kyc_status}
                      phone={driver.profiles?.phone}
                      registeredDate={new Date(driver.created_at).toLocaleDateString()}
                      profilePhotoUrl={driver.profiles?.profile_photo_url}
                      onView={() => handleView(driver.user_id, "driver")}
                    />
                  );
                })}
              </div>
            )}
          </TabsContent>

          <TabsContent value="suppliers" className="space-y-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search suppliers by name or company..."
                className="pl-10"
                value={allSuppliersSearch}
                onChange={(e) => setAllSuppliersSearch(e.target.value)}
                data-testid="input-search-all-suppliers"
              />
            </div>
            {!allSuppliers || allSuppliers.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <p>No suppliers registered yet</p>
              </div>
            ) : filteredAllSuppliers.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <p>No suppliers match your search</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {filteredAllSuppliers.map((supplier) => (
                  <SupplierCard
                    key={supplier.id}
                    id={supplier.id}
                    name={supplier.profiles?.full_name || 'N/A'}
                    companyName={supplier.name}
                    email={supplier.profiles?.email}
                    kybStatus={supplier.kyb_status}
                    cipcNumber={supplier.cipc_number}
                    phone={supplier.profiles?.phone}
                    registeredDate={new Date(supplier.created_at).toLocaleDateString()}
                    profilePhotoUrl={supplier.profiles?.profile_photo_url}
                    onView={() => handleView(supplier.owner_id, "supplier")}
                  />
                ))}
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

          <TabsContent value="settings" className="space-y-4">
            <div className="text-center py-12 text-muted-foreground">
              <p>Settings configuration will be available here</p>
            </div>
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
