import { useState } from "react";
import { AppHeader } from "@/components/AppHeader";
import { DepotCard } from "@/components/DepotCard";
import { StatsCard } from "@/components/StatsCard";
import { SupplierPricingManager } from "@/components/SupplierPricingManager";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, DollarSign, MapPin, TrendingUp } from "lucide-react";

export default function SupplierDashboard() {
  // TODO: remove mock functionality
  const [depots] = useState([
    {
      id: "1",
      name: "Shell Industrial Depot",
      location: "45 Industrial Ave, Johannesburg",
      coordinates: { lat: -26.2041, lng: 28.0473 },
      openHours: "Mon-Fri: 6AM-6PM",
      fuelPrices: [
        { type: "Diesel", pricePerLitre: 21.50 },
        { type: "Petrol 95", pricePerLitre: 23.20 },
        { type: "Petrol 93", pricePerLitre: 22.80 },
      ],
      isActive: true,
    },
    {
      id: "2",
      name: "BP Main Road Depot",
      location: "12 Main Rd, Cape Town",
      coordinates: { lat: -33.9249, lng: 18.4241 },
      openHours: "24/7",
      fuelPrices: [
        { type: "Diesel", pricePerLitre: 21.80 },
        { type: "Paraffin", pricePerLitre: 18.50 },
      ],
      isActive: true,
    },
  ]);

  return (
    <div className="min-h-screen bg-background">
      <AppHeader notificationCount={1} />
      
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold">My Depots</h1>
            <p className="text-muted-foreground">Manage your fuel supply locations</p>
          </div>
          <Button data-testid="button-add-depot">
            <Plus className="h-4 w-4 mr-2" />
            Add Depot
          </Button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          <StatsCard
            title="Total Revenue"
            value="R 45,230"
            description="This month"
            icon={DollarSign}
            trend={{ value: 8.5, isPositive: true }}
          />
          <StatsCard
            title="Active Depots"
            value={depots.filter(d => d.isActive).length.toString()}
            icon={MapPin}
          />
          <StatsCard
            title="Orders Fulfilled"
            value="124"
            description="This month"
            icon={TrendingUp}
          />
        </div>

        <Tabs defaultValue="depots" className="space-y-6">
          <div className="overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0">
            <TabsList className="min-w-max">
              <TabsTrigger value="depots" data-testid="tab-depots">Depots</TabsTrigger>
              <TabsTrigger value="pricing" data-testid="tab-pricing">Pricing</TabsTrigger>
              <TabsTrigger value="orders" data-testid="tab-orders">Orders</TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="depots" className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {depots.map((depot) => (
                <DepotCard
                  key={depot.id}
                  {...depot}
                  onEdit={() => console.log("Edit depot", depot.id)}
                />
              ))}
            </div>
          </TabsContent>

          <TabsContent value="pricing" className="space-y-4">
            <SupplierPricingManager />
          </TabsContent>

          <TabsContent value="orders" className="space-y-4">
            <div className="text-center py-12 text-muted-foreground">
              <p>No orders yet</p>
            </div>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
