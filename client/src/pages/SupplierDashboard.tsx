import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { AppHeader } from "@/components/AppHeader";
import { DepotCard } from "@/components/DepotCard";
import { StatsCard } from "@/components/StatsCard";
import { SupplierPricingManager } from "@/components/SupplierPricingManager";
import { DepotManagementDialog } from "@/components/DepotManagementDialog";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Plus, Package, MapPin, TrendingUp, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { formatCurrency } from "@/lib/utils";

export default function SupplierDashboard() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [depotDialogOpen, setDepotDialogOpen] = useState(false);
  const [selectedDepot, setSelectedDepot] = useState<any>(null);

  const { data: depots, isLoading: depotsLoading } = useQuery<any[]>({
    queryKey: ["/api/supplier/depots"],
  });

  const { data: orders, isLoading: ordersLoading } = useQuery<any[]>({
    queryKey: ["/api/supplier/orders"],
  });

  const deleteDepotMutation = useMutation({
    mutationFn: async (depotId: string) => {
      return apiRequest("DELETE", `/api/supplier/depots/${depotId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/supplier/depots"] });
      toast({
        title: "Success",
        description: "Depot deleted successfully",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleEditDepot = (depot: any) => {
    setSelectedDepot(depot);
    setDepotDialogOpen(true);
  };

  const handleDeleteDepot = (depotId: string) => {
    if (confirm("Are you sure you want to delete this depot?")) {
      deleteDepotMutation.mutate(depotId);
    }
  };

  const handleAddDepot = () => {
    setSelectedDepot(null);
    setDepotDialogOpen(true);
  };

  const activeDepots = depots?.filter((d: any) => d.is_active) || [];

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold">My Depots</h1>
            <p className="text-muted-foreground">
              Manage your fuel supply locations
            </p>
          </div>
          <Button onClick={handleAddDepot} data-testid="button-add-depot">
            <Plus className="h-4 w-4 mr-2" />
            Add Depot
          </Button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          <StatsCard
            title="Total Orders"
            value={orders?.length?.toString() || "0"}
            description="All time"
            icon={Package}
          />
          <StatsCard
            title="Active Depots"
            value={activeDepots.length.toString()}
            icon={MapPin}
          />
          <StatsCard
            title="Total Depots"
            value={depots?.length?.toString() || "0"}
            description="Including inactive"
            icon={TrendingUp}
          />
        </div>

        <Tabs defaultValue="depots" className="space-y-6">
          <div className="overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0">
            <TabsList className="min-w-max">
              <TabsTrigger value="depots" data-testid="tab-depots">
                Depots
              </TabsTrigger>
              <TabsTrigger value="pricing" data-testid="tab-pricing">
                Pricing
              </TabsTrigger>
              <TabsTrigger value="orders" data-testid="tab-orders">
                Orders
              </TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="depots" className="space-y-4">
            {depotsLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : depots && depots.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {depots.map((depot: any) => (
                  <DepotCard
                    key={depot.id}
                    id={depot.id}
                    name={depot.name}
                    location={`${depot.address_city || ''}, ${depot.address_province || ''}`.trim().replace(/^,\s*/, '') || 'No address'}
                    coordinates={{ lat: depot.lat, lng: depot.lng }}
                    openHours={typeof depot.open_hours === 'object' && depot.open_hours !== null
                      ? Object.entries(depot.open_hours)
                          .map(([day, hours]) => `${day}: ${hours}`)
                          .join(', ')
                      : 'Hours not set'}
                    fuelPrices={
                      depot.depot_prices?.map((dp: any) => ({
                        type: dp.fuel_types?.label || 'Unknown',
                        pricePerLitre: dp.price_cents / 100,
                      })) || []
                    }
                    isActive={depot.is_active}
                    onEdit={() => handleEditDepot(depot)}
                    onDelete={() => handleDeleteDepot(depot.id)}
                  />
                ))}
              </div>
            ) : (
              <div className="text-center py-12 text-muted-foreground">
                <MapPin className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>No depots yet</p>
                <p className="text-sm mt-2">
                  Click "Add Depot" to create your first depot
                </p>
              </div>
            )}
          </TabsContent>

          <TabsContent value="pricing" className="space-y-4">
            <SupplierPricingManager />
          </TabsContent>

          <TabsContent value="orders" className="space-y-4">
            {ordersLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : orders && orders.length > 0 ? (
              <div className="rounded-lg border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Order ID</TableHead>
                      <TableHead>Customer</TableHead>
                      <TableHead>Fuel Type</TableHead>
                      <TableHead>Quantity</TableHead>
                      <TableHead>Depot</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {orders.map((order: any) => (
                      <TableRow key={order.id} data-testid={`row-order-${order.id}`}>
                        <TableCell className="font-medium">
                          #{order.id.slice(0, 8)}
                        </TableCell>
                        <TableCell>
                          {order.customers?.profiles?.full_name || "Unknown"}
                        </TableCell>
                        <TableCell>
                          {order.fuel_types?.label || "Unknown"}
                        </TableCell>
                        <TableCell>{order.quantity_litres}L</TableCell>
                        <TableCell>
                          {order.depots?.name || "Unknown"}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={
                              order.state === "delivered"
                                ? "default"
                                : order.state === "cancelled"
                                ? "destructive"
                                : "secondary"
                            }
                            data-testid={`badge-status-${order.id}`}
                          >
                            {order.state}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          {order.total_price_cents
                            ? formatCurrency(order.total_price_cents / 100)
                            : "Pending"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <div className="text-center py-12 text-muted-foreground">
                <Package className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>No orders yet</p>
                <p className="text-sm mt-2">
                  Orders from customers will appear here
                </p>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </main>

      <DepotManagementDialog
        open={depotDialogOpen}
        onOpenChange={setDepotDialogOpen}
        depot={selectedDepot}
      />
    </div>
  );
}
