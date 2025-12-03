import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Fuel, History, Loader2, MapPin, Plus, Trash2, Edit2 } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { formatCurrency } from "@/lib/utils";

interface PricingTier {
  id: string;
  price_cents: number;
  min_litres: number;
  available_litres: number | null;
}

interface FuelTypeWithPricing {
  id: string;
  code: string;
  label: string;
  active: boolean;
  pricing_tiers: PricingTier[];
}

interface Depot {
  id: string;
  name: string;
  lat: number;
  lng: number;
}

export function SupplierPricingManager() {
  const { toast } = useToast();
  const [selectedDepotId, setSelectedDepotId] = useState<string>("");
  const [editingTier, setEditingTier] = useState<{ fuelTypeId: string; tierId?: string; minLitres: string; priceCents: string } | null>(null);
  const [editingStock, setEditingStock] = useState<Record<string, string>>({});

  // Fetch depots
  const { data: depots, isLoading: depotsLoading } = useQuery<Depot[]>({
    queryKey: ["/api/supplier/depots"],
    select: (data: any) => data.map((d: any) => ({
      id: d.id,
      name: d.name,
      lat: d.lat,
      lng: d.lng,
    })),
  });

  // Fetch pricing data for selected depot
  const { data: fuelTypes, isLoading: pricingLoading } = useQuery<FuelTypeWithPricing[]>({
    queryKey: ["/api/supplier/depots", selectedDepotId, "pricing"],
    enabled: !!selectedDepotId,
  });

  // Create tier mutation
  const createTierMutation = useMutation({
    mutationFn: async ({ fuelTypeId, priceCents, minLitres }: {
      fuelTypeId: string;
      priceCents: number;
      minLitres: number;
    }) => {
      const response = await apiRequest(
        "POST",
        `/api/supplier/depots/${selectedDepotId}/pricing/${fuelTypeId}/tiers`,
        { priceCents, minLitres }
      );
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/supplier/depots", selectedDepotId, "pricing"] });
      setEditingTier(null);
      toast({
        title: "Pricing tier created",
        description: "New pricing tier has been added successfully.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to create pricing tier",
        variant: "destructive",
      });
    },
  });

  // Update tier mutation
  const updateTierMutation = useMutation({
    mutationFn: async ({ tierId, priceCents, minLitres, availableLitres }: {
      tierId: string;
      priceCents?: number;
      minLitres?: number;
      availableLitres?: number;
    }) => {
      const response = await apiRequest(
        "PUT",
        `/api/supplier/depots/${selectedDepotId}/pricing/tiers/${tierId}`,
        { priceCents, minLitres, availableLitres }
      );
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/supplier/depots", selectedDepotId, "pricing"] });
      setEditingTier(null);
      toast({
        title: "Pricing tier updated",
        description: "Pricing tier has been updated successfully.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update pricing tier",
        variant: "destructive",
      });
    },
  });

  // Delete tier mutation
  const deleteTierMutation = useMutation({
    mutationFn: async (tierId: string) => {
      const response = await apiRequest(
        "DELETE",
        `/api/supplier/depots/${selectedDepotId}/pricing/tiers/${tierId}`
      );
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/supplier/depots", selectedDepotId, "pricing"] });
      toast({
        title: "Pricing tier deleted",
        description: "Pricing tier has been deleted successfully.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to delete pricing tier",
        variant: "destructive",
      });
    },
  });

  // Update stock mutation (works with or without tiers)
  const updateStockMutation = useMutation({
    mutationFn: async ({ fuelTypeId, availableLitres, tierId }: { fuelTypeId: string; availableLitres: number; tierId?: string }) => {
      // If tierId is provided, use the tier update endpoint
      // Otherwise, use the stock-only endpoint (which creates a default tier if needed)
      if (tierId) {
        const response = await apiRequest(
          "PUT",
          `/api/supplier/depots/${selectedDepotId}/pricing/tiers/${tierId}`,
          { availableLitres }
        );
        return response.json();
      } else {
        // Use the stock-only endpoint (works even when no tiers exist)
        const response = await apiRequest(
          "PUT",
          `/api/supplier/depots/${selectedDepotId}/pricing/${fuelTypeId}/stock`,
          { availableLitres }
        );
        return response.json();
      }
    },
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/supplier/depots", selectedDepotId, "pricing"] });
      setEditingStock({});
      const message = variables.tierId 
        ? "Available stock has been updated successfully."
        : "Available stock has been updated successfully. A default pricing tier (R 100.00/L) was created. You can update the price when you add pricing tiers.";
      toast({
        title: "Stock updated",
        description: message,
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update stock",
        variant: "destructive",
      });
    },
  });

  const handleAddTier = (fuelTypeId: string) => {
    setEditingTier({ fuelTypeId, minLitres: "0", priceCents: "" });
  };

  const handleEditTier = (fuelTypeId: string, tier: PricingTier) => {
    setEditingTier({
      fuelTypeId,
      tierId: tier.id,
      minLitres: tier.min_litres.toString(),
      priceCents: (tier.price_cents / 100).toString(),
    });
  };

  const handleSaveTier = () => {
    if (!editingTier) return;

    const priceCents = parseFloat(editingTier.priceCents) * 100;
    const minLitres = parseFloat(editingTier.minLitres);

    if (isNaN(priceCents) || priceCents < 0) {
      toast({
        title: "Invalid price",
        description: "Please enter a valid price",
        variant: "destructive",
      });
      return;
    }

    if (isNaN(minLitres) || minLitres < 0) {
      toast({
        title: "Invalid minimum litres",
        description: "Please enter a valid minimum litres (>= 0)",
        variant: "destructive",
      });
      return;
    }

    if (editingTier.tierId) {
      // Update existing tier
      updateTierMutation.mutate({
        tierId: editingTier.tierId,
        priceCents,
        minLitres,
      });
    } else {
      // Create new tier (stock is managed separately)
      createTierMutation.mutate({
        fuelTypeId: editingTier.fuelTypeId,
        priceCents,
        minLitres,
      });
    }
  };

  const handleDeleteTier = (tierId: string, fuelTypeId: string) => {
    if (window.confirm("Are you sure you want to delete this pricing tier?")) {
      deleteTierMutation.mutate(tierId);
    }
  };

  const handleUpdateStock = (fuelTypeId: string, tierId?: string) => {
    const stockValue = editingStock[fuelTypeId];
    if (stockValue === undefined || stockValue === null || stockValue === "") {
      toast({
        title: "No stock value",
        description: "Please enter a stock amount to update",
        variant: "destructive",
      });
      return;
    }

    const stock = parseFloat(stockValue);
    if (isNaN(stock) || stock < 0) {
      toast({
        title: "Invalid stock",
        description: "Please enter a valid stock amount (must be a number >= 0)",
        variant: "destructive",
      });
      return;
    }

    updateStockMutation.mutate({ fuelTypeId, availableLitres: stock, tierId });
  };

  const getTierRange = (tier: PricingTier, allTiers: PricingTier[], index: number): string => {
    const minLitres = Number(tier.min_litres) || 0;
    const nextTier = allTiers[index + 1];
    if (nextTier) {
      const nextMin = Number(nextTier.min_litres) || 0;
      if (nextMin > minLitres) {
        return `${minLitres}L - ${nextMin - 1}L`;
      }
    }
    return `${minLitres}L+`;
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Fuel className="h-5 w-5" />
          Fuel Pricing (Tiered)
        </CardTitle>
        <CardDescription>
          Set different prices based on order quantity. Stock is shared across all tiers for each fuel type.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Depot Selection */}
        <div>
          <Label htmlFor="depot-select">Select Depot</Label>
          <Select value={selectedDepotId} onValueChange={setSelectedDepotId}>
            <SelectTrigger id="depot-select" className="mt-1.5">
              <SelectValue placeholder="Choose a depot to manage pricing..." />
            </SelectTrigger>
            <SelectContent>
              {depots?.map((depot) => (
                <SelectItem key={depot.id} value={depot.id}>
                  <div className="flex items-center gap-2">
                    <MapPin className="h-4 w-4" />
                    {depot.name}
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Pricing Tiers */}
        {selectedDepotId && (
          <div className="space-y-6">
            {pricingLoading ? (
              <div className="flex justify-center items-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : (
              fuelTypes?.map((fuelType) => {
                const sortedTiers = [...fuelType.pricing_tiers].sort((a, b) => a.min_litres - b.min_litres);
                // Get any tier for stock update (prefer the first one, but any will work since stock is shared)
                const tierForStock = sortedTiers.length > 0 ? sortedTiers[0] : null;
                const stock = tierForStock?.available_litres ?? 0;

                return (
                  <div key={fuelType.id} className="border-2 rounded-lg p-4 space-y-4 bg-card shadow-sm mb-4">
                    <div className="flex justify-between items-center pb-3 border-b">
                      <div>
                        <h4 className="font-medium text-lg">{fuelType.label}</h4>
                        <p className="text-sm text-muted-foreground">{fuelType.code.toUpperCase()}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-xs text-muted-foreground mb-1">Available Stock</p>
                        <p className="text-2xl font-bold text-primary">{stock}L</p>
                      </div>
                    </div>

                    {/* Stock Management Section */}
                    <div className="bg-muted/50 rounded-md p-3 border">
                      <Label className="text-sm font-medium">Update Stock (Shared across all tiers)</Label>
                      <div className="flex gap-2 mt-2">
                        <Input
                          type="number"
                          step="0.1"
                          min="0"
                          placeholder={stock.toString()}
                          value={editingStock[fuelType.id] ?? stock.toString()}
                          onChange={(e) => setEditingStock(prev => ({ ...prev, [fuelType.id]: e.target.value }))}
                          className="flex-1"
                        />
                        <Button
                          onClick={() => {
                            handleUpdateStock(fuelType.id, tierForStock?.id);
                          }}
                          disabled={updateStockMutation.isPending}
                        >
                          {updateStockMutation.isPending ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            "Update Stock"
                          )}
                        </Button>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">
                        Stock is shared across all pricing tiers for this fuel type
                      </p>
                    </div>

                    {/* Tiers List */}
                    <div className="space-y-2">
                      {sortedTiers.length > 0 ? (
                        sortedTiers.map((tier, index) => (
                          <div key={tier.id} className="flex items-center justify-between p-3 bg-muted rounded-md">
                            <div className="flex-1">
                              <div className="font-medium">
                                {formatCurrency(tier.price_cents / 100)}/L
                              </div>
                              <div className="text-sm text-muted-foreground">
                                {getTierRange(tier, sortedTiers, index)}
                              </div>
                            </div>
                            <div className="flex gap-2">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleEditTier(fuelType.id, tier)}
                              >
                                <Edit2 className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleDeleteTier(tier.id, fuelType.id)}
                                disabled={deleteTierMutation.isPending}
                                title="Delete tier"
                              >
                                {deleteTierMutation.isPending ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                  <Trash2 className="h-4 w-4" />
                                )}
                              </Button>
                            </div>
                          </div>
                        ))
                      ) : (
                        <p className="text-sm text-muted-foreground text-center py-4">
                          No pricing tiers set. Add your first tier to get started.
                        </p>
                      )}
                    </div>

                    {/* Add Tier Button */}
                    <Button
                      variant="outline"
                      onClick={() => handleAddTier(fuelType.id)}
                      className="w-full"
                    >
                      <Plus className="h-4 w-4 mr-2" />
                      Add Pricing Tier
                    </Button>
                  </div>
                );
              })
            )}
          </div>
        )}

        {/* Add/Edit Tier Dialog */}
        {editingTier && (
          <Dialog open={!!editingTier} onOpenChange={() => setEditingTier(null)}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>
                  {editingTier.tierId ? "Edit Pricing Tier" : "Add Pricing Tier"}
                </DialogTitle>
                <DialogDescription>
                  Set the minimum order quantity and price for this tier.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <Label>Minimum Litres</Label>
                  <Input
                    type="number"
                    step="1"
                    min="0"
                    value={editingTier.minLitres}
                    onChange={(e) => setEditingTier(prev => prev ? { ...prev, minLitres: e.target.value } : null)}
                    placeholder="0"
                    className="mt-1.5"
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    Orders with this quantity or more will use this price
                  </p>
                </div>
                <div>
                  <Label>Price per Litre (Rands)</Label>
                  <div className="relative mt-1.5">
                    <span className="absolute left-3 top-3 text-muted-foreground">R</span>
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      value={editingTier.priceCents}
                      onChange={(e) => setEditingTier(prev => prev ? { ...prev, priceCents: e.target.value } : null)}
                      placeholder="0.00"
                      className="pl-8"
                    />
                  </div>
                </div>
                <div className="flex justify-end gap-2">
                  <Button variant="outline" onClick={() => setEditingTier(null)}>
                    Cancel
                  </Button>
                  <Button
                    onClick={handleSaveTier}
                    disabled={createTierMutation.isPending || updateTierMutation.isPending}
                  >
                    {createTierMutation.isPending || updateTierMutation.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      editingTier.tierId ? "Update" : "Create"
                    )}
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        )}
      </CardContent>
    </Card>
  );
}

