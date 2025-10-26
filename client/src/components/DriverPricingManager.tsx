import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { DollarSign, History, Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";

interface FuelTypeWithPricing {
  id: string;
  code: string;
  label: string;
  active: boolean;
  pricing: {
    id: string;
    delivery_fee_cents: number;
    active: boolean;
  } | null;
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

export function DriverPricingManager() {
  const { toast } = useToast();
  const [showHistory, setShowHistory] = useState(false);
  const [editingPrices, setEditingPrices] = useState<Record<string, string>>({});
  const [editingNotes, setEditingNotes] = useState<Record<string, string>>({});

  // Fetch pricing data
  const { data: fuelTypes, isLoading } = useQuery<FuelTypeWithPricing[]>({
    queryKey: ["/api/driver/pricing"],
  });

  // Fetch pricing history
  const { data: history } = useQuery<PricingHistoryItem[]>({
    queryKey: ["/api/driver/pricing/history"],
    enabled: showHistory,
  });

  // Update pricing mutation
  const updatePricingMutation = useMutation({
    mutationFn: async ({ fuelTypeId, deliveryFeeCents, notes }: { 
      fuelTypeId: string; 
      deliveryFeeCents: number;
      notes?: string;
    }) => {
      const response = await apiRequest(
        "PUT",
        `/api/driver/pricing/${fuelTypeId}`,
        { deliveryFeeCents, notes }
      );
      return response.json();
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/driver/pricing"] });
      queryClient.invalidateQueries({ queryKey: ["/api/driver/pricing/history"] });
      toast({
        title: "Pricing updated",
        description: "Your delivery fee has been updated successfully.",
      });
      // Clear the editing state for this fuel type
      setEditingPrices((prev) => {
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

  const handleNotesChange = (fuelTypeId: string, value: string) => {
    setEditingNotes((prev) => ({ ...prev, [fuelTypeId]: value }));
  };

  const handleSave = (fuelTypeId: string, currentPriceCents: number | null) => {
    const rands = editingPrices[fuelTypeId];
    if (!rands) {
      toast({
        title: "Error",
        description: "Please enter a valid price",
        variant: "destructive",
      });
      return;
    }

    const deliveryFeeCents = Math.round(parseFloat(rands) * 100);
    
    if (isNaN(deliveryFeeCents) || deliveryFeeCents < 0) {
      toast({
        title: "Error",
        description: "Please enter a valid price",
        variant: "destructive",
      });
      return;
    }

    updatePricingMutation.mutate({
      fuelTypeId,
      deliveryFeeCents,
      notes: editingNotes[fuelTypeId],
    });
  };

  const getCurrentPrice = (fuelType: FuelTypeWithPricing): string => {
    if (editingPrices[fuelType.id] !== undefined) {
      return editingPrices[fuelType.id];
    }
    if (fuelType.pricing) {
      return (fuelType.pricing.delivery_fee_cents / 100).toFixed(2);
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

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex justify-center items-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex justify-between items-start gap-4">
            <div>
              <CardTitle className="flex items-center gap-2">
                <DollarSign className="h-5 w-5" />
                Delivery Pricing
              </CardTitle>
              <CardDescription>
                Set your delivery fees for different fuel types. These are the amounts you'll earn per delivery.
              </CardDescription>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowHistory(true)}
              data-testid="button-view-pricing-history"
            >
              <History className="h-4 w-4 mr-2" />
              History
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-6">
            {fuelTypes?.map((fuelType) => (
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
                        {formatCurrency(fuelType.pricing.delivery_fee_cents)}
                      </p>
                      <p className="text-xs text-muted-foreground">per delivery</p>
                    </div>
                  )}
                </div>

                <div className="grid gap-4">
                  <div>
                    <Label htmlFor={`price-${fuelType.id}`}>
                      Delivery Fee (Rands)
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
                        onClick={() => handleSave(fuelType.id, fuelType.pricing?.delivery_fee_cents || null)}
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
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Pricing History Dialog */}
      <Dialog open={showHistory} onOpenChange={setShowHistory}>
        <DialogContent className="max-w-2xl" data-testid="dialog-pricing-history">
          <DialogHeader>
            <DialogTitle>Pricing History</DialogTitle>
            <DialogDescription>
              View your past pricing changes and adjustments
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
