import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AppHeader } from "@/components/AppHeader";
import { KYCDocumentCard } from "@/components/KYCDocumentCard";
import { StatsCard } from "@/components/StatsCard";
import { CreateUserDialog } from "@/components/CreateUserDialog";
import { DollarSign, Users, Truck, TrendingUp } from "lucide-react";
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
  };
}

export default function AdminDashboard() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch pending KYC/KYB applications
  const { data: pendingKYC, isLoading } = useQuery<PendingKYC>({
    queryKey: ["/api/admin/kyc/pending"],
  });

  // Fetch all customers
  const { data: customers, isLoading: customersLoading } = useQuery<Customer[]>({
    queryKey: ["/api/admin/customers"],
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
    applicantName: driver.profiles.full_name,
    applicantType: "driver" as const,
    documentType: driver.vehicle_registration || "Driver Application",
    submittedDate: new Date(driver.created_at).toLocaleString(),
    status: "pending" as const,
  })) || [];

  const supplierKYC = pendingKYC?.suppliers?.map(supplier => ({
    id: supplier.id,
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

  const handleView = (id: string, type: string) => {
    toast({
      title: "View Document",
      description: `Opening ${type} document for ID: ${id}`,
    });
    // TODO: Implement document viewer modal
  };

  if (isLoading || customersLoading) {
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
            title="Total Revenue"
            value="R 0"
            description="Last 30 days"
            icon={DollarSign}
          />
          <StatsCard
            title="Active Drivers"
            value="0"
            description="Currently online"
            icon={Truck}
          />
          <StatsCard
            title="Total Orders"
            value="0"
            description="This month"
            icon={TrendingUp}
          />
          <StatsCard
            title="Pending KYC"
            value={driverKYC.length + supplierKYC.length}
            description="Awaiting review"
            icon={Users}
          />
        </div>

        <Tabs defaultValue="customers" className="space-y-6">
          <TabsList>
            <TabsTrigger value="customers" data-testid="tab-customers">
              Customers ({customers?.length || 0})
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
            {!customers || customers.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <p>No customers registered yet</p>
              </div>
            ) : (
              <div className="bg-card rounded-lg border overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-muted/50 border-b">
                      <tr>
                        <th className="px-4 py-3 text-left text-sm font-medium">Name</th>
                        <th className="px-4 py-3 text-left text-sm font-medium">Company</th>
                        <th className="px-4 py-3 text-left text-sm font-medium">VAT Number</th>
                        <th className="px-4 py-3 text-left text-sm font-medium">Phone</th>
                        <th className="px-4 py-3 text-left text-sm font-medium">Registered</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {customers.map((customer) => (
                        <tr 
                          key={customer.id} 
                          className="hover-elevate"
                          data-testid={`customer-row-${customer.id}`}
                        >
                          <td className="px-4 py-3 text-sm" data-testid={`customer-name-${customer.id}`}>
                            {customer.profiles?.full_name || 'N/A'}
                          </td>
                          <td className="px-4 py-3 text-sm text-muted-foreground">
                            {customer.company_name || '-'}
                          </td>
                          <td className="px-4 py-3 text-sm text-muted-foreground">
                            {customer.vat_number || '-'}
                          </td>
                          <td className="px-4 py-3 text-sm text-muted-foreground">
                            {customer.profiles?.phone || '-'}
                          </td>
                          <td className="px-4 py-3 text-sm text-muted-foreground">
                            {new Date(customer.created_at).toLocaleDateString()}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </TabsContent>

          <TabsContent value="driver-kyc" className="space-y-4">
            {driverKYC.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <p>No pending driver KYC applications</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {driverKYC.map((doc) => (
                  <KYCDocumentCard
                    key={doc.id}
                    {...doc}
                    onApprove={() => handleDriverApprove(doc.id)}
                    onReject={() => handleDriverReject(doc.id)}
                    onView={() => handleView(doc.id, "driver")}
                  />
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="supplier-kyc" className="space-y-4">
            {supplierKYC.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <p>No pending supplier KYB applications</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {supplierKYC.map((doc) => (
                  <KYCDocumentCard
                    key={doc.id}
                    {...doc}
                    onApprove={() => handleSupplierApprove(doc.id)}
                    onReject={() => handleSupplierReject(doc.id)}
                    onView={() => handleView(doc.id, "supplier")}
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
    </div>
  );
}
