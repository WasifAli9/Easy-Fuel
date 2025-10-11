import { useState } from "react";
import { AppHeader } from "@/components/AppHeader";
import { OrderCard } from "@/components/OrderCard";
import { Button } from "@/components/ui/button";
import { Plus, Filter } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export default function CustomerDashboard() {
  // TODO: remove mock functionality
  const [orders] = useState([
    {
      id: "1",
      fuelType: "Diesel",
      litres: 500,
      location: "123 Industrial Rd, Johannesburg",
      date: "2025-01-15 14:30",
      totalAmount: 11250.00,
      status: "delivered" as const,
    },
    {
      id: "2",
      fuelType: "Petrol 95",
      litres: 200,
      location: "45 Main St, Cape Town",
      date: "2025-01-15 10:00",
      totalAmount: 4850.00,
      status: "en_route" as const,
    },
    {
      id: "3",
      fuelType: "Paraffin",
      litres: 100,
      location: "78 Farm Rd, Pretoria",
      date: "2025-01-14 16:00",
      totalAmount: 1950.00,
      status: "awaiting_payment" as const,
    },
  ]);

  return (
    <div className="min-h-screen bg-background">
      <AppHeader notificationCount={2} />
      
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold">My Orders</h1>
            <p className="text-muted-foreground">Track and manage your fuel deliveries</p>
          </div>
          <Button data-testid="button-new-order">
            <Plus className="h-4 w-4 mr-2" />
            New Order
          </Button>
        </div>

        <Tabs defaultValue="all" className="space-y-6">
          <div className="flex items-center justify-between">
            <TabsList>
              <TabsTrigger value="all" data-testid="tab-all">All Orders</TabsTrigger>
              <TabsTrigger value="active" data-testid="tab-active">Active</TabsTrigger>
              <TabsTrigger value="completed" data-testid="tab-completed">Completed</TabsTrigger>
            </TabsList>
            <Button variant="outline" size="sm" data-testid="button-filter">
              <Filter className="h-4 w-4 mr-2" />
              Filter
            </Button>
          </div>

          <TabsContent value="all" className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {orders.map((order) => (
                <OrderCard
                  key={order.id}
                  {...order}
                  onView={() => console.log("View order", order.id)}
                />
              ))}
            </div>
          </TabsContent>

          <TabsContent value="active" className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {orders.filter(o => !["delivered", "cancelled"].includes(o.status)).map((order) => (
                <OrderCard
                  key={order.id}
                  {...order}
                  onView={() => console.log("View order", order.id)}
                />
              ))}
            </div>
          </TabsContent>

          <TabsContent value="completed" className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {orders.filter(o => o.status === "delivered").map((order) => (
                <OrderCard
                  key={order.id}
                  {...order}
                  onView={() => console.log("View order", order.id)}
                />
              ))}
            </div>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
