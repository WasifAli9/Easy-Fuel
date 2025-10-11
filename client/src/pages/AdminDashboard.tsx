import { useState } from "react";
import { AppHeader } from "@/components/AppHeader";
import { KYCDocumentCard } from "@/components/KYCDocumentCard";
import { StatsCard } from "@/components/StatsCard";
import { DollarSign, Users, Truck, TrendingUp } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export default function AdminDashboard() {
  // TODO: remove mock functionality
  const [driverKYC] = useState([
    {
      id: "1",
      applicantName: "John Doe",
      applicantType: "driver" as const,
      documentType: "Driver's License",
      submittedDate: "2025-01-10 14:30",
      status: "pending" as const,
    },
    {
      id: "2",
      applicantName: "Jane Smith",
      applicantType: "driver" as const,
      documentType: "Vehicle Registration",
      submittedDate: "2025-01-12 09:15",
      status: "pending" as const,
    },
  ]);

  const [supplierKYC] = useState([
    {
      id: "3",
      applicantName: "ABC Fuel Suppliers",
      applicantType: "supplier" as const,
      documentType: "Company Registration",
      submittedDate: "2025-01-11 11:20",
      status: "pending" as const,
    },
  ]);

  return (
    <div className="min-h-screen bg-background">
      <AppHeader notificationCount={5} />
      
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2">Admin Dashboard</h1>
          <p className="text-muted-foreground">Monitor platform operations and manage verifications</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <StatsCard
            title="Total Revenue"
            value="R 125,430"
            description="Last 30 days"
            icon={DollarSign}
            trend={{ value: 12.5, isPositive: true }}
          />
          <StatsCard
            title="Active Drivers"
            value="48"
            description="Currently online"
            icon={Truck}
            trend={{ value: 8.2, isPositive: true }}
          />
          <StatsCard
            title="Total Orders"
            value="342"
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

        <Tabs defaultValue="driver-kyc" className="space-y-6">
          <TabsList>
            <TabsTrigger value="driver-kyc" data-testid="tab-driver-kyc">
              Driver KYC ({driverKYC.length})
            </TabsTrigger>
            <TabsTrigger value="supplier-kyc" data-testid="tab-supplier-kyc">
              Supplier KYC ({supplierKYC.length})
            </TabsTrigger>
            <TabsTrigger value="settings" data-testid="tab-settings">Settings</TabsTrigger>
          </TabsList>

          <TabsContent value="driver-kyc" className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {driverKYC.map((doc) => (
                <KYCDocumentCard
                  key={doc.id}
                  {...doc}
                  onApprove={() => console.log("Approve", doc.id)}
                  onReject={() => console.log("Reject", doc.id)}
                  onView={() => console.log("View", doc.id)}
                />
              ))}
            </div>
          </TabsContent>

          <TabsContent value="supplier-kyc" className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {supplierKYC.map((doc) => (
                <KYCDocumentCard
                  key={doc.id}
                  {...doc}
                  onApprove={() => console.log("Approve", doc.id)}
                  onReject={() => console.log("Reject", doc.id)}
                  onView={() => console.log("View", doc.id)}
                />
              ))}
            </div>
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
