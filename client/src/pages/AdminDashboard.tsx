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
import { DollarSign, Users, Truck, TrendingUp, Building2, UserCheck, Search } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

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
    phone?: string;
    role: string;
    profile_photo_url?: string;
  };
}

interface Driver {
  id: string;
  user_id: string;
  kyc_status: string;
  vehicle_registration?: string;
  created_at: string;
  profiles: {
    id: string;
    full_name: string;
    phone?: string;
    role: string;
    profile_photo_url?: string;
  };
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
    phone?: string;
    role: string;
    profile_photo_url?: string;
  };
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
    customer.profiles?.full_name.toLowerCase().includes(customerSearch.toLowerCase()) ||
    customer.company_name?.toLowerCase().includes(customerSearch.toLowerCase())
  ) || [];

  // Filter all drivers based on search
  const filteredAllDrivers = allDrivers?.filter((driver) =>
    driver.profiles?.full_name.toLowerCase().includes(allDriversSearch.toLowerCase()) ||
    driver.vehicle_registration?.toLowerCase().includes(allDriversSearch.toLowerCase())
  ) || [];

  // Filter all suppliers based on search
  const filteredAllSuppliers = allSuppliers?.filter((supplier) =>
    supplier.name.toLowerCase().includes(allSuppliersSearch.toLowerCase()) ||
    supplier.profiles?.full_name.toLowerCase().includes(allSuppliersSearch.toLowerCase())
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
          <TabsList>
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
            <TabsTrigger value="settings" data-testid="tab-settings">Settings</TabsTrigger>
          </TabsList>

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
                {filteredAllDrivers.map((driver) => (
                  <DriverCard
                    key={driver.id}
                    id={driver.id}
                    name={driver.profiles?.full_name || 'N/A'}
                    vehicleRegistration={driver.vehicle_registration}
                    kycStatus={driver.kyc_status}
                    phone={driver.profiles?.phone}
                    registeredDate={new Date(driver.created_at).toLocaleDateString()}
                    profilePhotoUrl={driver.profiles?.profile_photo_url}
                    onView={() => handleView(driver.user_id, "driver")}
                  />
                ))}
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
    </div>
  );
}
