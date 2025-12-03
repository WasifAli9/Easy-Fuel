import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Fuel, History, Loader2, MapPin } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";

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

interface PricingHistoryItem {
  id: string;
  fuel_types: {
    label: string;
    code: string;
  };
  old_price_cents: number | null;
  new_price_cents: number;
  notes: string | null;
  created_at: string;
}

export function SupplierPricingManager() {
  const { toast } = useToast();
  const [selectedDepotId, setSelectedDepotId] = useState<string>("");
  const [showHistory, setShowHistory] = useState(false);
  const [editingPrices, setEditingPrices] = useState<Record<string, string>>({});
  const [editingAvailableLitres, setEditingAvailableLitres] = useState<Record<string, string>>({});
  const [editingNotes, setEditingNotes] = useState<Record<string, string>>({});

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

  // Fetch pricing history for selected depot
  const { data: history } = useQuery<PricingHistoryItem[]>({
    queryKey: ["/api/supplier/depots", selectedDepotId, "pricing/history"],
    enabled: showHistory && !!selectedDepotId,
  });

  // Update pricing mutation
  const updatePricingMutation = useMutation({
    mutationFn: async ({ fuelTypeId, priceCents, availableLitres, notes }: { 
      fuelTypeId: string; 
      priceCents: number;
      availableLitres?: number | null;
      notes?: string;
    }) => {
      const response = await apiRequest(
        "PUT",
        `/api/supplier/depots/${selectedDepotId}/pricing/${fuelTypeId}`,
        { priceCents, availableLitres, notes }
      );
      return response.json();
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ 
        queryKey: ["/api/supplier/depots", selectedDepotId, "pricing"] 
      });
      queryClient.invalidateQueries({ 
        queryKey: ["/api/supplier/depots", selectedDepotId, "pricing/history"] 
      });
      toast({
        title: "Pricing updated",
        description: "Fuel price has been updated successfully.",
      });
      // Clear the editing state for this fuel type
      setEditingPrices((prev) => {
        const next = { ...prev };
        delete next[variables.fuelTypeId];
        return next;
      });
      setEditingAvailableLitres((prev) => {
        const next = { ...prev };
        delete next[variables.fuelTypeId];
        return next;
      });
      setEditingNotes((prev) => {
        const next = { ...prev };
        delete next[variables.fuelTypeId];
        return next;
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update pricing",
        variant: "destructive",
      });
    },
  });

  const handlePriceChange = (fuelTypeId: string, value: string) => {
    setEditingPrices((prev) => ({ ...prev, [fuelTypeId]: value }));
  };

  const handleAvailableLitresChange = (fuelTypeId: string, value: string) => {
    setEditingAvailableLitres((prev) => ({ ...prev, [fuelTypeId]: value }));
  };

  const handleNotesChange = (fuelTypeId: string, value: string) => {
    setEditingNotes((prev) => ({ ...prev, [fuelTypeId]: value }));
  };

  const handleSave = (fuelTypeId: string) => {
    const rands = editingPrices[fuelTypeId];
    if (!rands) {
      toast({
        title: "Error",
        description: "Please enter a valid price",
        variant: "destructive",
      });
      return;
    }

    const priceCents = Math.round(parseFloat(rands) * 100);
    
    if (isNaN(priceCents) || priceCents < 0) {
      toast({
        title: "Error",
        description: "Please enter a valid price",
        variant: "destructive",
      });
      return;
    }

    const availableLitres = editingAvailableLitres[fuelTypeId] 
      ? parseFloat(editingAvailableLitres[fuelTypeId])
      : fuelTypes?.find(ft => ft.id === fuelTypeId)?.pricing?.available_litres ?? null;

    updatePricingMutation.mutate({
      fuelTypeId,
      priceCents,
      availableLitres: availableLitres !== null && !isNaN(availableLitres) ? availableLitres : null,
      notes: editingNotes[fuelTypeId],
    });
  };

  const getCurrentPrice = (fuelType: FuelTypeWithPricing): string => {
    if (editingPrices[fuelType.id] !== undefined) {
      return editingPrices[fuelType.id];
    }
    if (fuelType.pricing) {
      return (fuelType.pricing.price_cents / 100).toFixed(2);
    }
    return "";
  };

  const formatCurrency = (cents: number) => {
    return `R ${(cents / 100).toFixed(2)}`;
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleString("en-ZA", {
      dateStyle: "medium",
      timeStyle: "short",
    });
  };

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex justify-between items-start gap-4">
            <div className="flex-1">
              <CardTitle className="flex items-center gap-2">
                <Fuel className="h-5 w-5" />
                Fuel Pricing
              </CardTitle>
              <CardDescription>
                Set your fuel prices per litre for each depot and fuel type
              </CardDescription>
            </div>
            {selectedDepotId && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowHistory(true)}
                data-testid="button-view-pricing-history"
              >
                <History className="h-4 w-4 mr-2" />
                History
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Depot Selection */}
          <div>
            <Label htmlFor="depot-select">Select Depot</Label>
            <Select value={selectedDepotId} onValueChange={setSelectedDepotId}>
              <SelectTrigger 
                id="depot-select" 
                className="mt-1.5"
                data-testid="select-depot"
              >
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

          {/* Pricing Table */}
          {selectedDepotId && (
            <div className="space-y-4">
              {pricingLoading ? (
                <div className="flex justify-center items-center py-12">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              ) : (
                fuelTypes?.map((fuelType) => (
                  <div
                    key={fuelType.id}
                    className="border rounded-lg p-4 space-y-4"
                    data-testid={`pricing-item-${fuelType.code}`}
                  >
                    <div className="flex justify-between items-center">
                      <div>
                        <h4 className="font-medium">{fuelType.label}</h4>
                        <p className="text-sm text-muted-foreground">
                          {fuelType.code.toUpperCase()}
                        </p>
                      </div>
                      {fuelType.pricing && !editingPrices[fuelType.id] && (
                        <div className="text-right">
                          <p className="text-2xl font-bold">
                            {formatCurrency(fuelType.pricing.price_cents)}
                          </p>
                          <p className="text-xs text-muted-foreground">per litre</p>
                          <p className="text-sm font-medium mt-1">
                            Stock: {(fuelType.pricing.available_litres ?? 0)}L
                          </p>
                        </div>
                      )}
                    </div>

                    <div className="grid gap-4">
                      <div>
                        <Label htmlFor={`price-${fuelType.id}`}>
                          Price per Litre (Rands)
                        </Label>
                        <div className="flex gap-2 mt-1.5">
                          <div className="relative flex-1">
                            <span className="absolute left-3 top-3 text-muted-foreground">R</span>
                            <Input
                              id={`price-${fuelType.id}`}
                              type="number"
                              step="0.01"
                              min="0"
                              placeholder="0.00"
                              value={getCurrentPrice(fuelType)}
                              onChange={(e) => handlePriceChange(fuelType.id, e.target.value)}
                              className="pl-8"
                              data-testid={`input-price-${fuelType.code}`}
                            />
                          </div>
                          <Button
                            onClick={() => handleSave(fuelType.id)}
                            disabled={updatePricingMutation.isPending}
                            data-testid={`button-save-${fuelType.code}`}
                          >
                            {updatePricingMutation.isPending ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              "Save"
                            )}
                          </Button>
                        </div>
                      </div>

                      <div>
                        <Label htmlFor={`available-litres-${fuelType.id}`}>
                          Available Stock (Litres) {!fuelType.pricing && "*"}
                        </Label>
                        <Input
                          id={`available-litres-${fuelType.id}`}
                          type="number"
                          step="0.1"
                          min="0"
                          placeholder={(fuelType.pricing?.available_litres ?? 0).toString()}
                          value={editingAvailableLitres[fuelType.id] ?? (fuelType.pricing?.available_litres ?? 0).toString() ?? ""}
                          onChange={(e) => handleAvailableLitresChange(fuelType.id, e.target.value)}
                          className="mt-1.5"
                          data-testid={`input-available-litres-${fuelType.code}`}
                        />
                        <p className="text-xs text-muted-foreground mt-1">
                          {fuelType.pricing 
                            ? "Update stock when adding more fuel. Required when adding new fuel type."
                            : "Required when adding new fuel type"}
                        </p>
                      </div>

                      {editingPrices[fuelType.id] !== undefined && (
                        <div>
                          <Label htmlFor={`notes-${fuelType.id}`}>
                            Notes (Optional)
                          </Label>
                          <Textarea
                            id={`notes-${fuelType.id}`}
                            placeholder="Add a note about this price change..."
                            value={editingNotes[fuelType.id] || ""}
                            onChange={(e) => handleNotesChange(fuelType.id, e.target.value)}
                            rows={2}
                            className="mt-1.5"
                            data-testid={`input-notes-${fuelType.code}`}
                          />
                        </div>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {!selectedDepotId && !depotsLoading && (
            <div className="text-center py-12 text-muted-foreground">
              <MapPin className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>Select a depot to manage fuel pricing</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Pricing History Dialog */}
      <Dialog open={showHistory} onOpenChange={setShowHistory}>
        <DialogContent className="max-w-2xl" data-testid="dialog-pricing-history">
          <DialogHeader>
            <DialogTitle>Pricing History</DialogTitle>
            <DialogDescription>
              View past pricing changes for this depot
            </DialogDescription>
          </DialogHeader>

          <ScrollArea className="h-[400px] pr-4">
            {history && history.length > 0 ? (
              <div className="space-y-4">
                {history.map((item) => (
                  <div
                    key={item.id}
                    className="border rounded-lg p-4 space-y-2"
                    data-testid={`history-item-${item.id}`}
                  >
                    <div className="flex justify-between items-start">
                      <div>
                        <p className="font-medium">{item.fuel_types.label}</p>
                        <p className="text-sm text-muted-foreground">
                          {formatDate(item.created_at)}
                        </p>
                      </div>
                      <div className="text-right">
                        <div className="flex items-center gap-2">
                          {item.old_price_cents !== null && (
                            <>
                              <span className="text-sm text-muted-foreground line-through">
                                {formatCurrency(item.old_price_cents)}
                              </span>
                              <span className="text-sm text-muted-foreground">→</span>
                            </>
                          )}
                          <span className="font-medium">
                            {formatCurrency(item.new_price_cents)}
                          </span>
                        </div>
                      </div>
                    </div>
                    {item.notes && (
                      <p className="text-sm text-muted-foreground italic">
                        "{item.notes}"
                      </p>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-12 text-muted-foreground">
                <p>No pricing history yet</p>
              </div>
            )}
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </>
  );
}
