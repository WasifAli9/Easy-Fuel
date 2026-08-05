import { useEffect, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { ArrowLeft, ChevronRight, Fuel, Loader2, MapPin, Plus, Trash2, Edit2, Warehouse } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { formatCurrency, cn } from "@/lib/utils";

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
  address_city?: string | null;
  address_province?: string | null;
  is_active?: boolean;
}

export function SupplierPricingManager({
  onGoToDepots,
}: {
  onGoToDepots?: () => void;
} = {}) {
  const { toast } = useToast();
  const [selectedDepotId, setSelectedDepotId] = useState<string>("");
  const [editingTier, setEditingTier] = useState<{ fuelTypeId: string; tierId?: string; minLitres: string; priceCents: string } | null>(null);
  const [editingStock, setEditingStock] = useState<Record<string, string>>({});

  // Fetch depots
  const { data: depots, isLoading: depotsLoading } = useQuery<Depot[]>({
    queryKey: ["/api/supplier/depots"],
    select: (data: any) =>
      (data || []).map((d: any) => ({
        id: d.id,
        name: d.name,
        lat: d.lat,
        lng: d.lng,
        address_city: d.address_city,
        address_province: d.address_province,
        is_active: d.is_active,
      })),
  });

  // Auto-select when there is exactly one depot
  useEffect(() => {
    if (!selectedDepotId && depots?.length === 1) {
      setSelectedDepotId(depots[0].id);
    }
  }, [depots, selectedDepotId]);

  const selectedDepot = depots?.find((d) => d.id === selectedDepotId);

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
    <div className="space-y-6">
      {/* Step 1: pick a depot (skip visual step once selected) */}
      {!selectedDepotId && (
        <Card className="overflow-hidden border-border/60 shadow-lg shadow-primary/[0.04]">
          <CardHeader className="border-b border-border/50 bg-gradient-to-br from-primary/[0.08] via-transparent to-transparent">
            <CardTitle className="flex items-center gap-2 text-xl">
              <Warehouse className="h-5 w-5 text-primary" />
              Choose a depot
            </CardTitle>
            <CardDescription>
              Pricing is set per depot. Tap a depot below to edit fuel prices and stock.
              {onGoToDepots ? (
                <>
                  {" "}
                  To add or edit locations, open{" "}
                  <button
                    type="button"
                    onClick={onGoToDepots}
                    className="font-medium text-primary underline-offset-2 hover:underline"
                  >
                    Depots
                  </button>
                  .
                </>
              ) : null}
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-6">
            {depotsLoading ? (
              <div className="flex justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : !depots?.length ? (
              <div className="rounded-xl border border-dashed border-border/80 bg-muted/30 px-6 py-12 text-center">
                <MapPin className="mx-auto mb-3 h-10 w-10 text-muted-foreground/70" />
                <p className="font-medium">No depots yet</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Create a depot first, then come back here to set prices.
                </p>
                {onGoToDepots ? (
                  <Button className="mt-4 rounded-full" onClick={onGoToDepots}>
                    Go to Depots
                  </Button>
                ) : null}
              </div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                {depots.map((depot) => {
                  const place = [depot.address_city, depot.address_province].filter(Boolean).join(", ");
                  return (
                    <button
                      key={depot.id}
                      type="button"
                      onClick={() => setSelectedDepotId(depot.id)}
                      className={cn(
                        "group flex items-start gap-3 rounded-xl border border-border/70 bg-card p-4 text-left transition-all",
                        "hover:border-primary/40 hover:bg-primary/[0.06] hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      )}
                    >
                      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-primary">
                        <MapPin className="h-5 w-5" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <p className="truncate font-semibold">{depot.name}</p>
                          {depot.is_active === false ? (
                            <Badge variant="secondary" className="shrink-0 text-[10px]">
                              Inactive
                            </Badge>
                          ) : (
                            <Badge className="shrink-0 text-[10px]">Active</Badge>
                          )}
                        </div>
                        <p className="mt-0.5 text-sm text-muted-foreground">
                          {place || "Set prices & stock for this location"}
                        </p>
                      </div>
                      <ChevronRight className="mt-1 h-5 w-5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
                    </button>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Step 2: pricing for selected depot */}
      {selectedDepotId && (
        <>
          <div className="flex flex-col gap-3 rounded-2xl border border-border/60 bg-gradient-to-br from-card via-card to-primary/[0.06] p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
            <div className="flex items-start gap-3 min-w-0">
              {(depots?.length || 0) > 1 ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="mt-0.5 shrink-0 rounded-full"
                  onClick={() => setSelectedDepotId("")}
                  aria-label="Back to depot list"
                >
                  <ArrowLeft className="h-4 w-4" />
                </Button>
              ) : null}
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-wider text-primary/90">Pricing for</p>
                <h2 className="truncate text-lg font-bold sm:text-xl">{selectedDepot?.name || "Depot"}</h2>
                <p className="text-sm text-muted-foreground">
                  Tiered prices by quantity · stock shared per fuel type
                </p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2 shrink-0">
              {(depots?.length || 0) > 1 ? (
                <Button variant="outline" className="rounded-full" onClick={() => setSelectedDepotId("")}>
                  Switch depot
                </Button>
              ) : null}
              {onGoToDepots ? (
                <Button variant="secondary" className="rounded-full" onClick={onGoToDepots}>
                  <MapPin className="mr-2 h-4 w-4" />
                  Manage depots
                </Button>
              ) : null}
            </div>
          </div>

          <Card className="border-border/60 shadow-md shadow-primary/[0.03]">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Fuel className="h-4 w-4 text-primary" />
                Fuel types & tiers
              </CardTitle>
              <CardDescription>
                Drivers see these prices when ordering from this depot.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {pricingLoading ? (
                <div className="flex justify-center items-center py-12">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              ) : !fuelTypes?.length ? (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  No active fuel types available. Ask an admin to enable fuels.
                </p>
              ) : (
                fuelTypes.map((fuelType) => {
                  const sortedTiers = [...fuelType.pricing_tiers].sort((a, b) => a.min_litres - b.min_litres);
                  const tierForStock = sortedTiers.length > 0 ? sortedTiers[0] : null;
                  const stock = tierForStock?.available_litres ?? 0;

                  return (
                    <div
                      key={fuelType.id}
                      className="rounded-xl border border-border/70 bg-gradient-to-b from-muted/40 to-card p-4 space-y-4 shadow-sm"
                    >
                      <div className="flex justify-between items-center gap-3 pb-3 border-b border-border/50">
                        <div>
                          <h4 className="font-semibold text-lg">{fuelType.label}</h4>
                          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                            {fuelType.code}
                          </p>
                        </div>
                        <div className="text-right rounded-lg bg-primary/10 px-3 py-2">
                          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                            Stock
                          </p>
                          <p className="text-xl font-bold text-primary tabular-nums">{stock}L</p>
                        </div>
                      </div>

                      <div className="rounded-lg border border-border/60 bg-background/60 p-3">
                        <Label className="text-sm font-medium">Update stock (shared across tiers)</Label>
                        <div className="flex gap-2 mt-2">
                          <Input
                            type="number"
                            step="0.1"
                            min="0"
                            placeholder={stock.toString()}
                            value={editingStock[fuelType.id] ?? stock.toString()}
                            onChange={(e) =>
                              setEditingStock((prev) => ({ ...prev, [fuelType.id]: e.target.value }))
                            }
                            className="flex-1"
                          />
                          <Button
                            onClick={() => handleUpdateStock(fuelType.id, tierForStock?.id)}
                            disabled={updateStockMutation.isPending}
                          >
                            {updateStockMutation.isPending ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              "Save stock"
                            )}
                          </Button>
                        </div>
                      </div>

                      <div className="space-y-2">
                        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                          Price tiers
                        </p>
                        {sortedTiers.length > 0 ? (
                          sortedTiers.map((tier, index) => (
                            <div
                              key={tier.id}
                              className="flex items-center justify-between gap-3 rounded-lg border border-border/50 bg-muted/40 px-3 py-2.5"
                            >
                              <div className="flex-1 min-w-0">
                                <div className="font-semibold tabular-nums">
                                  {formatCurrency(tier.price_cents / 100)}/L
                                </div>
                                <div className="text-sm text-muted-foreground">
                                  {getTierRange(tier, sortedTiers, index)}
                                </div>
                              </div>
                              <div className="flex gap-1">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleEditTier(fuelType.id, tier)}
                                  aria-label="Edit tier"
                                >
                                  <Edit2 className="h-4 w-4" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleDeleteTier(tier.id, fuelType.id)}
                                  disabled={deleteTierMutation.isPending}
                                  title="Delete tier"
                                  aria-label="Delete tier"
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
                          <p className="text-sm text-muted-foreground text-center py-4 rounded-lg border border-dashed">
                            No tiers yet — add a starting price (e.g. 0L+).
                          </p>
                        )}
                      </div>

                      <Button
                        variant="outline"
                        onClick={() => handleAddTier(fuelType.id)}
                        className="w-full rounded-lg border-primary/30 hover:bg-primary/10"
                      >
                        <Plus className="h-4 w-4 mr-2" />
                        Add pricing tier
                      </Button>
                    </div>
                  );
                })
              )}
            </CardContent>
          </Card>
        </>
      )}

      {editingTier && (
        <Dialog open={!!editingTier} onOpenChange={() => setEditingTier(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {editingTier.tierId ? "Edit pricing tier" : "Add pricing tier"}
              </DialogTitle>
              <DialogDescription>
                Set the minimum order quantity and price for this tier.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>Minimum litres</Label>
                <Input
                  type="number"
                  step="1"
                  min="0"
                  value={editingTier.minLitres}
                  onChange={(e) =>
                    setEditingTier((prev) => (prev ? { ...prev, minLitres: e.target.value } : null))
                  }
                  placeholder="0"
                  className="mt-1.5"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Orders with this quantity or more will use this price
                </p>
              </div>
              <div>
                <Label>Price per litre (Rands)</Label>
                <div className="relative mt-1.5">
                  <span className="absolute left-3 top-3 text-muted-foreground">R</span>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    value={editingTier.priceCents}
                    onChange={(e) =>
                      setEditingTier((prev) => (prev ? { ...prev, priceCents: e.target.value } : null))
                    }
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
                  ) : editingTier.tierId ? (
                    "Update"
                  ) : (
                    "Create"
                  )}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

