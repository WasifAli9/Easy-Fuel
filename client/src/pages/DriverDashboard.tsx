import { useState } from "react";
import { AppHeader } from "@/components/AppHeader";
import { JobCard } from "@/components/JobCard";
import { StatsCard } from "@/components/StatsCard";
import { DollarSign, TrendingUp, CheckCircle } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export default function DriverDashboard() {
  // TODO: remove mock functionality
  const [jobs] = useState([
    {
      id: "1",
      fuelType: "Diesel",
      litres: 500,
      pickupLocation: "Shell Depot, 45 Industrial Ave",
      dropLocation: "123 Construction Site, Sandton",
      distance: 15.2,
      earnings: 450.00,
      expiresIn: 120,
      isPremium: true,
    },
    {
      id: "2",
      fuelType: "Petrol 95",
      litres: 200,
      pickupLocation: "BP Depot, Main Rd",
      dropLocation: "89 Office Park, Rosebank",
      distance: 8.5,
      earnings: 280.00,
      expiresIn: 90,
    },
  ]);

  const [assignedJobs] = useState([
    {
      id: "3",
      fuelType: "Paraffin",
      litres: 100,
      pickupLocation: "Total Depot, 12 Farm Rd",
      dropLocation: "456 Residential, Centurion",
      distance: 22.0,
      earnings: 320.00,
    },
  ]);

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
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {jobs.map((job) => (
                <JobCard
                  key={job.id}
                  {...job}
                  onAccept={() => console.log("Accept job", job.id)}
                  onReject={() => console.log("Reject job", job.id)}
                />
              ))}
            </div>
          </TabsContent>

          <TabsContent value="assigned" className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {assignedJobs.map((job) => (
                <JobCard
                  key={job.id}
                  {...job}
                />
              ))}
            </div>
          </TabsContent>

          <TabsContent value="history" className="space-y-4">
            <div className="text-center py-12 text-muted-foreground">
              <p>No completed jobs yet</p>
            </div>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
