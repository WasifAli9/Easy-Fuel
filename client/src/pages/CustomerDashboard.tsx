import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AppHeader } from "@/components/AppHeader";
import { OrderCard } from "@/components/OrderCard";
import { CreateOrderDialog } from "@/components/CreateOrderDialog";
import { ViewOrderDialog } from "@/components/ViewOrderDialog";
import { Button } from "@/components/ui/button";
import { Filter, Plus } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export default function CustomerDashboard() {
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [viewDialogOpen, setViewDialogOpen] = useState(false);

  // Fetch orders from API
  const { data: orders = [], isLoading } = useQuery<any[]>({
    queryKey: ["/api/orders"],
  });

  return (
    <div className="min-h-screen bg-background">
      <AppHeader notificationCount={2} />
      
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold">My Orders</h1>
            <p className="text-muted-foreground">Track and manage your fuel deliveries</p>
          </div>
          <CreateOrderDialog />
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
            {isLoading ? (
              <div className="text-center py-8 text-muted-foreground">Loading orders...</div>
            ) : orders.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">No orders found. Create your first order!</div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {orders.map((order) => (
                  <OrderCard
                    key={order.id}
                    id={order.id}
                    fuelType={order.fuel_types?.label || "Unknown"}
                    litres={parseFloat(order.litres)}
                    location={`${order.drop_lat}, ${order.drop_lng}`}
                    date={new Date(order.created_at).toLocaleString()}
                    totalAmount={order.total_cents / 100}
                    status={order.state}
                    onView={() => {
                      setSelectedOrderId(order.id);
                      setViewDialogOpen(true);
                    }}
                  />
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="active" className="space-y-4">
            {isLoading ? (
              <div className="text-center py-8 text-muted-foreground">Loading orders...</div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {orders
                  .filter(o => !["delivered", "cancelled"].includes(o.state))
                  .map((order) => (
                    <OrderCard
                      key={order.id}
                      id={order.id}
                      fuelType={order.fuel_types?.label || "Unknown"}
                      litres={parseFloat(order.litres)}
                      location={`${order.drop_lat}, ${order.drop_lng}`}
                      date={new Date(order.created_at).toLocaleString()}
                      totalAmount={order.total_cents / 100}
                      status={order.state}
                      onView={() => {
                        setSelectedOrderId(order.id);
                        setViewDialogOpen(true);
                      }}
                    />
                  ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="completed" className="space-y-4">
            {isLoading ? (
              <div className="text-center py-8 text-muted-foreground">Loading orders...</div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {orders
                  .filter(o => o.state === "delivered")
                  .map((order) => (
                    <OrderCard
                      key={order.id}
                      id={order.id}
                      fuelType={order.fuel_types?.label || "Unknown"}
                      litres={parseFloat(order.litres)}
                      location={`${order.drop_lat}, ${order.drop_lng}`}
                      date={new Date(order.created_at).toLocaleString()}
                      totalAmount={order.total_cents / 100}
                      status={order.state}
                      onView={() => {
                        setSelectedOrderId(order.id);
                        setViewDialogOpen(true);
                      }}
                    />
                  ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </main>

      {/* View/Edit Order Dialog */}
      {selectedOrderId && (
        <ViewOrderDialog
          orderId={selectedOrderId}
          open={viewDialogOpen}
          onOpenChange={setViewDialogOpen}
        />
      )}
    </div>
  );
}
