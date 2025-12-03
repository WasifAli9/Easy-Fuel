import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { MapPin, Package, Loader2, ShoppingCart, XCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { formatCurrency } from "@/lib/utils";
import { useCurrency } from "@/hooks/use-currency";

interface DriverDepotsViewProps {
  defaultTab?: "orders" | "depots";
}

export function DriverDepotsView({ defaultTab = "orders" }: DriverDepotsViewProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { currency } = useCurrency();
  const [selectedDepot, setSelectedDepot] = useState<any>(null);
  const [orderDialogOpen, setOrderDialogOpen] = useState(false);
  const [litres, setLitres] = useState("");
  const [selectedFuelType, setSelectedFuelType] = useState<string | null>(null);
  const [pickupDate, setPickupDate] = useState("");
  const [notes, setNotes] = useState("");

  // Fetch all depots with distance
  const { data: depots, isLoading: depotsLoading, error: depotsError } = useQuery<any[]>({
    queryKey: ["/api/driver/depots"],
    refetchInterval: 30000, // Refresh every 30 seconds
    retry: 2,
    retryDelay: 1000,
  });

  // Fetch driver's depot orders
  const { data: orders, isLoading: ordersLoading } = useQuery<any[]>({
    queryKey: ["/api/driver/depot-orders"],
    refetchInterval: 10000, // Refresh every 10 seconds
  });

  // Create order mutation
  const createOrderMutation = useMutation({
    mutationFn: async (data: {
      depotId: string;
      fuelTypeId: string;
      litres: number;
      pickupDate?: string;
      notes?: string;
    }) => {
      return apiRequest("POST", "/api/driver/depot-orders", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/driver/depot-orders"] });
      setOrderDialogOpen(false);
      setSelectedDepot(null);
      setLitres("");
      setSelectedFuelType(null);
      setPickupDate("");
      setNotes("");
      toast({
        title: "Order Placed",
        description: "Your fuel order has been placed successfully.",
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

  // Cancel order mutation
  const cancelOrderMutation = useMutation({
    mutationFn: async (orderId: string) => {
      return apiRequest("POST", `/api/driver/depot-orders/${orderId}/cancel`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/driver/depot-orders"] });
      queryClient.invalidateQueries({ queryKey: ["/api/driver/depots"] }); // Refresh depots to show updated stock
      toast({
        title: "Order Cancelled",
        description: "Your order has been cancelled and stock has been added back to the depot.",
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

  const handleOrderClick = (depot: any) => {
    setSelectedDepot(depot);
    setOrderDialogOpen(true);
    if (depot.depot_prices && depot.depot_prices.length > 0) {
      setSelectedFuelType(depot.depot_prices[0].fuel_type_id);
    }
  };

  const handlePlaceOrder = () => {
    if (!selectedDepot || !selectedFuelType || !litres || !pickupDate) {
      toast({
        title: "Validation Error",
        description: "Please select fuel type, enter litres, and select pickup date",
        variant: "destructive",
      });
      return;
    }

    const litresNum = parseFloat(litres);
    if (isNaN(litresNum) || litresNum <= 0) {
      toast({
        title: "Validation Error",
        description: "Please enter a valid number of litres",
        variant: "destructive",
      });
      return;
    }

    // Validate order quantity is less than available stock
    const availableLitres = selectedFuelTypeData?.available_litres ?? 0;
    if (availableLitres > 0 && litresNum >= availableLitres) {
      toast({
        title: "Validation Error",
        description: `You can only order less than ${availableLitres}L. Available stock: ${availableLitres}L`,
        variant: "destructive",
      });
      return;
    }

    // Validate pickup date is in the future
    const pickupDateTime = new Date(pickupDate);
    if (pickupDateTime <= new Date()) {
      toast({
        title: "Validation Error",
        description: "Pickup date must be in the future",
        variant: "destructive",
      });
      return;
    }

    createOrderMutation.mutate({
      depotId: selectedDepot.id,
      fuelTypeId: selectedFuelType,
      litres: litresNum,
      pickupDate: pickupDate,
      notes: notes || undefined,
    });
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, "default" | "secondary" | "destructive"> = {
      pending: "secondary",
      confirmed: "default",
      fulfilled: "default",
      cancelled: "destructive",
    };
    return (
      <Badge variant={variants[status] || "secondary"}>
        {status.charAt(0).toUpperCase() + status.slice(1)}
      </Badge>
    );
  };

  // Get all tiers for selected fuel type and find the appropriate tier based on quantity
  const getSelectedFuelTypeTier = (litres: number) => {
    if (!selectedDepot || !selectedFuelType) return null;
    
    const tiers = selectedDepot.depot_prices?.filter(
      (p: any) => p.fuel_type_id === selectedFuelType
    ) || [];
    
    if (tiers.length === 0) return null;
    
    // Sort tiers by min_litres descending to find the highest applicable tier
    const sortedTiers = [...tiers].sort((a: any, b: any) => {
      const aMin = parseFloat(a.min_litres?.toString() || "0");
      const bMin = parseFloat(b.min_litres?.toString() || "0");
      return bMin - aMin;
    });
    
    // Find the tier with highest min_litres that is <= order quantity
    for (const tier of sortedTiers) {
      const minLitres = parseFloat(tier.min_litres?.toString() || "0");
      if (litres >= minLitres) {
        return tier;
      }
    }
    
    // If no tier matches, use the tier with lowest min_litres (should be 0)
    return sortedTiers[sortedTiers.length - 1];
  };

  const selectedFuelTypeData = getSelectedFuelTypeTier(parseFloat(litres) || 0);

  return (
    <>
      {defaultTab === "orders" ? (
        <div className="space-y-4">
        {ordersLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : orders && orders.length > 0 ? (
          <div className="rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Depot</TableHead>
                  <TableHead>Fuel Type</TableHead>
                  <TableHead>Litres</TableHead>
                  <TableHead>Price</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {orders.map((order: any) => (
                  <TableRow key={order.id}>
                    <TableCell className="font-medium">
                      {order.depots?.name || "Unknown"}
                    </TableCell>
                    <TableCell>
                      {order.fuel_types?.label || "Unknown"}
                    </TableCell>
                    <TableCell>{order.litres}L</TableCell>
                    <TableCell>
                      {formatCurrency(order.total_price_cents / 100, currency)}
                    </TableCell>
                    <TableCell>{getStatusBadge(order.status)}</TableCell>
                    <TableCell>
                      {new Date(order.created_at).toLocaleDateString()}
                    </TableCell>
                    <TableCell className="text-right">
                      {order.status === "pending" && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            if (
                              confirm(
                                "Are you sure you want to cancel this order?"
                              )
                            ) {
                              cancelOrderMutation.mutate(order.id);
                            }
                          }}
                          disabled={cancelOrderMutation.isPending}
                          className="text-destructive hover:text-destructive hover:bg-destructive/10"
                          title="Cancel order"
                        >
                          {cancelOrderMutation.isPending ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <XCircle className="h-4 w-4" />
                          )}
                        </Button>
                      )}
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
              Order fuel from depots to get started
            </p>
          </div>
        )}
        </div>
      ) : (
        <div className="space-y-4">
          {depotsError ? (
          <div className="text-center py-12 text-destructive">
            <p>Error loading depots: {depotsError instanceof Error ? depotsError.message : "Unknown error"}</p>
            <Button 
              onClick={() => queryClient.invalidateQueries({ queryKey: ["/api/driver/depots"] })}
              className="mt-4"
            >
              Retry
            </Button>
          </div>
        ) : depotsLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : depots && depots.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {depots.map((depot: any) => (
              <Card key={depot.id}>
                <CardHeader>
                  <CardTitle className="flex items-center justify-between">
                    <span>{depot.name}</span>
                    {depot.distance_km !== null && (
                      <Badge variant="outline">
                        {depot.distance_km.toFixed(1)} km
                      </Badge>
                    )}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <div className="flex items-start text-sm text-muted-foreground">
                      <MapPin className="h-4 w-4 mr-2 mt-0.5 flex-shrink-0" />
                      <div className="flex-1">
                        {depot.address_street && (
                          <div>{depot.address_street}</div>
                        )}
                        <div>
                          {[
                            depot.address_city,
                            depot.address_province,
                            depot.address_postal_code
                          ].filter(Boolean).join(", ")}
                        </div>
                        {!depot.address_street && !depot.address_city && !depot.address_province && !depot.address_postal_code && (
                          <div className="text-xs italic">Address not available</div>
                        )}
                      </div>
                    </div>
                    {depot.suppliers && (
                      <div className="text-sm text-muted-foreground">
                        Supplier: {depot.suppliers.name || depot.suppliers.registered_name}
                      </div>
                    )}
                  </div>

                  {depot.depot_prices && depot.depot_prices.length > 0 && (
                    <div className="space-y-2">
                      <div className="text-sm font-medium">Available Fuel:</div>
                      <div className="space-y-3">
                        {(() => {
                          // Group prices by fuel_type_id to show tiers together
                          const pricesByFuelType = depot.depot_prices.reduce((acc: any, price: any) => {
                            const fuelTypeId = price.fuel_type_id;
                            if (!acc[fuelTypeId]) {
                              acc[fuelTypeId] = {
                                fuelType: price.fuel_types,
                                tiers: [],
                                stock: price.available_litres ?? 0,
                              };
                            }
                            acc[fuelTypeId].tiers.push(price);
                            return acc;
                          }, {});

                          return Object.values(pricesByFuelType).map((group: any) => {
                            const sortedTiers = [...group.tiers].sort((a: any, b: any) => 
                              parseFloat(a.min_litres?.toString() || "0") - parseFloat(b.min_litres?.toString() || "0")
                            );

                            const getTierRange = (tier: any, index: number) => {
                              const minLitres = Number(tier.min_litres) || 0;
                              const nextTier = sortedTiers[index + 1];
                              if (nextTier) {
                                const nextMin = Number(nextTier.min_litres) || 0;
                                if (nextMin > minLitres) {
                                  return `${minLitres}L - ${nextMin - 1}L`;
                                }
                              }
                              return `${minLitres}L+`;
                            };

                            return (
                              <div key={group.fuelType?.id} className="border-2 rounded-lg p-3 bg-card shadow-sm space-y-2">
                                <div className="flex items-center justify-between">
                                  <div className="font-semibold text-sm">
                                    {group.fuelType?.label || "Unknown"}
                                  </div>
                                  <div className="text-xs font-medium text-primary">
                                    Stock: {group.stock}L
                                  </div>
                                </div>
                                <div className="space-y-1.5 pt-2 border-t">
                                  <div className="text-xs text-muted-foreground mb-1">Pricing Tiers:</div>
                                  {sortedTiers.map((tier: any, index: number) => (
                                    <div 
                                      key={tier.id} 
                                      className="flex justify-between items-center text-xs bg-muted/50 rounded px-2 py-1.5"
                                    >
                                      <span className="text-muted-foreground font-medium">
                                        {getTierRange(tier, index)}:
                                      </span>
                                      <span className="font-semibold text-foreground">
                                        {formatCurrency(tier.price_cents / 100, currency)}/L
                                      </span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            );
                          });
                        })()}
                      </div>
                    </div>
                  )}

                  <Button
                    onClick={() => handleOrderClick(depot)}
                    className="w-full"
                    size="sm"
                  >
                    <ShoppingCart className="h-4 w-4 mr-2" />
                    Order Fuel
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <div className="text-center py-12 text-muted-foreground">
            <Package className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>No depots available</p>
          </div>
        )}
        </div>
      )}

      {/* Order Dialog */}
      <Dialog open={orderDialogOpen} onOpenChange={setOrderDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Order Fuel from {selectedDepot?.name}</DialogTitle>
            <DialogDescription>
              Place an order for fuel from this depot
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="fuelType">Fuel Type *</Label>
              <select
                id="fuelType"
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={selectedFuelType || ""}
                onChange={(e) => {
                  setSelectedFuelType(e.target.value);
                  setLitres(""); // Reset litres when fuel type changes
                }}
              >
                <option value="">Select fuel type</option>
                {(() => {
                  // Get unique fuel types
                  const fuelTypesMap = new Map();
                  selectedDepot?.depot_prices?.forEach((price: any) => {
                    if (!fuelTypesMap.has(price.fuel_type_id)) {
                      fuelTypesMap.set(price.fuel_type_id, price.fuel_types);
                    }
                  });
                  return Array.from(fuelTypesMap.entries()).map(([fuelTypeId, fuelType]: [string, any]) => (
                    <option key={fuelTypeId} value={fuelTypeId}>
                      {fuelType?.label || "Unknown"}
                    </option>
                  ));
                })()}
              </select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="litres">Litres *</Label>
              <Input
                id="litres"
                type="number"
                min="1"
                step="0.1"
                value={litres}
                onChange={(e) => setLitres(e.target.value)}
                placeholder="Enter number of litres"
              />
            </div>

            {selectedFuelTypeData && (
              <div className="p-3 bg-muted rounded-md space-y-2">
                <div className="flex justify-between text-sm">
                  <span>Available Stock:</span>
                  <span className={`font-medium ${
                    litres && parseFloat(litres) >= (selectedFuelTypeData.available_litres ?? 0)
                      ? "text-destructive" 
                      : "text-foreground"
                  }`}>
                    {(selectedFuelTypeData.available_litres ?? 0)}L
                  </span>
                </div>
                {litres && parseFloat(litres) > 0 && (
                  <>
                    <div className="flex justify-between text-sm">
                      <span>Price per litre:</span>
                      <span className="font-medium">
                        {formatCurrency(
                          selectedFuelTypeData.price_cents / 100,
                          currency
                        )}
                      </span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span>Total:</span>
                      <span className="font-bold">
                        {formatCurrency(
                          (selectedFuelTypeData.price_cents / 100) *
                            parseFloat(litres),
                          currency
                        )}
                      </span>
                    </div>
                    {parseFloat(litres) >= (selectedFuelTypeData.available_litres ?? 0) && (
                      <p className="text-xs text-destructive mt-1">
                        Order quantity must be less than available stock
                      </p>
                    )}
                  </>
                )}
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="pickupDate">Pickup Date *</Label>
              <Input
                id="pickupDate"
                type="datetime-local"
                value={pickupDate}
                onChange={(e) => setPickupDate(e.target.value)}
                min={new Date().toISOString().slice(0, 16)}
                required
              />
              <p className="text-xs text-muted-foreground">
                Select the date and time when you will pick up the fuel from this depot
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="notes">Notes (Optional)</Label>
              <textarea
                id="notes"
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm min-h-[80px]"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Any special instructions or notes..."
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setOrderDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button
              onClick={handlePlaceOrder}
              disabled={
                createOrderMutation.isPending || 
                !selectedFuelType || 
                !litres || 
                !pickupDate ||
                (selectedFuelTypeData && (selectedFuelTypeData.available_litres ?? 0) > 0 && parseFloat(litres) >= (selectedFuelTypeData.available_litres ?? 0))
              }
            >
              {createOrderMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Placing Order...
                </>
              ) : (
                "Place Order"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

