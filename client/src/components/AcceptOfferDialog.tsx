import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Calendar, Coins, Calculator } from "lucide-react";
import { useCurrency } from "@/hooks/use-currency";
import { useEffect, useMemo } from "react";

const acceptOfferSchema = z.object({
  proposedDeliveryTime: z.string().min(1, "Please select a delivery date and time"),
  pricePerKm: z
    .string()
    .min(1, "Please enter your price per km")
    .refine(
      (val) => {
        const parsed = parseFloat(val);
        return !isNaN(parsed) && parsed >= 0;
      },
      { message: "Price per km must be a positive number" }
    ),
  notes: z.string().max(500, "Notes must be 500 characters or less").optional(),
});

type AcceptOfferValues = z.infer<typeof acceptOfferSchema>;

interface AcceptOfferDialogProps {
  offerId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// Helper function to calculate distance in km using Haversine formula
function calculateDistanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371; // Earth's radius in kilometers
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c * 10) / 10; // Round to 1 decimal place
}

export function AcceptOfferDialog({
  offerId,
  open,
  onOpenChange,
}: AcceptOfferDialogProps) {
  const { toast } = useToast();
  const { currencySymbol } = useCurrency();

  // Set default time to 2 hours from now
  const defaultTime = new Date(Date.now() + 2 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 16);

  // Fetch offer/order details
  const { data: offersData } = useQuery<any>({
    queryKey: ["/api/driver/offers"],
    enabled: open,
  });

  const offers = Array.isArray(offersData) ? offersData : (offersData?.offers || []);
  const offer = offers.find((o: any) => o.id === offerId);
  const order = offer?.orders;

  // Fetch driver pricing for this fuel type
  const { data: driverPricing } = useQuery<any[]>({
    queryKey: ["/api/driver/pricing"],
    enabled: open && !!order?.fuel_type_id,
  });

  const fuelPricePerLiter = useMemo(() => {
    if (!driverPricing || !order?.fuel_type_id) return 0;
    const pricing = driverPricing.find((p: any) => p.id === order.fuel_type_id);
    return pricing?.pricing?.fuel_price_per_liter_cents || 0;
  }, [driverPricing, order?.fuel_type_id]);

  // Calculate distance from depot to drop location
  const distanceKm = useMemo(() => {
    if (!order?.selected_depot_id || !order?.drop_lat || !order?.drop_lng) return 0;
    // We'll need to fetch depot location, but for now estimate or fetch from backend
    // For simplicity, we'll calculate if we have depot data
    // This should ideally come from the backend
    return 0; // Will be calculated on backend
  }, [order]);

  const form = useForm<AcceptOfferValues>({
    resolver: zodResolver(acceptOfferSchema),
    defaultValues: {
      proposedDeliveryTime: defaultTime,
      pricePerKm: "",
      notes: "",
    },
  });

  // Calculate total price when form values change
  const pricePerKmValue = form.watch("pricePerKm");
  const totalPrice = useMemo(() => {
    if (!order || !pricePerKmValue) return 0;
    const litres = parseFloat(order.litres) || 0;
    const fuelPricePerLiterRands = fuelPricePerLiter / 100;
    const pricePerKmRands = parseFloat(pricePerKmValue) || 0;
    
    // Total = (fuel_price_per_liter * litres) + (price_per_km * distance_km)
    // Note: distance will be calculated on backend, so we show estimated total
    const fuelCost = fuelPricePerLiterRands * litres;
    // For display, we'll show fuel cost + estimated delivery (will be recalculated on backend)
    return fuelCost;
  }, [order, fuelPricePerLiter, pricePerKmValue]);

  const acceptOfferMutation = useMutation({
    mutationFn: async (values: AcceptOfferValues) => {
      const pricePerKmCents = Math.round(parseFloat(values.pricePerKm) * 100);
      const response = await apiRequest("POST", `/api/driver/offers/${offerId}/accept`, {
        proposedDeliveryTime: values.proposedDeliveryTime,
        pricePerKmCents,
        notes: values.notes || undefined,
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/driver/offers"] });
      queryClient.invalidateQueries({ queryKey: ["/api/driver/assigned-orders"] });
      queryClient.invalidateQueries({ queryKey: ["/api/driver/stats"] });
      toast({
        title: "Quote submitted",
        description: "Your delivery quote was sent to the customer. We'll notify you once they respond.",
      });
      form.reset({
        proposedDeliveryTime: defaultTime,
        pricePerKm: "",
        notes: "",
      });
      onOpenChange(false);
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to submit quote",
        variant: "destructive",
      });
    },
  });

  const onSubmit = (values: AcceptOfferValues) => {
    acceptOfferMutation.mutate(values);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[520px]" data-testid="dialog-accept-offer">
        <DialogHeader>
          <DialogTitle>Submit Delivery Quote</DialogTitle>
          <DialogDescription>
            Confirm when you can deliver and set your price per km. The customer will review your quote before assigning the job.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <FormField
              control={form.control}
              name="proposedDeliveryTime"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Proposed Delivery Date & Time</FormLabel>
                  <FormControl>
                    <div className="relative">
                      <Calendar className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                      <Input
                        type="datetime-local"
                        {...field}
                        className="pl-10"
                        data-testid="input-proposed-delivery-time"
                        min={new Date().toISOString().slice(0, 16)}
                      />
                    </div>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="pricePerKm"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Price per Km ({currencySymbol})</FormLabel>
                  <FormControl>
                    <div className="relative">
                      <Coins className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                      <Input
                        type="number"
                        min="0"
                        step="0.01"
                        placeholder="e.g. 5.50"
                        {...field}
                        className="pl-10"
                        data-testid="input-price-per-km"
                      />
                    </div>
                  </FormControl>
                  <p className="text-xs text-muted-foreground">
                    Enter your price per kilometer for delivery. The total will be calculated based on distance from depot to delivery location.
                  </p>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Display calculated total */}
            {order && pricePerKmValue && (
              <div className="bg-muted p-4 rounded-lg space-y-2">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <Calculator className="h-4 w-4" />
                  <span>Quote Summary</span>
                </div>
                <div className="space-y-1 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Fuel Cost:</span>
                    <span>{currencySymbol} {((fuelPricePerLiter / 100) * parseFloat(order.litres || 0)).toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Delivery Fee (estimated):</span>
                    <span className="text-muted-foreground italic">Calculated on acceptance</span>
                  </div>
                  <div className="flex justify-between pt-2 border-t font-medium">
                    <span>Total (estimated):</span>
                    <span>{currencySymbol} {totalPrice.toFixed(2)} + delivery</span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-2">
                    Final total will be calculated when customer accepts: (Fuel Price × Litres) + (Price per Km × Distance)
                  </p>
                </div>
              </div>
            )}

            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Notes (optional)</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Share additional information with the customer (equipment requirements, timing constraints, etc.)"
                      {...field}
                      data-testid="input-quote-notes"
                      rows={3}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="bg-muted p-4 rounded-lg">
              <p className="text-sm text-muted-foreground">
                We'll send this quote to the customer immediately. You'll be notified when they accept or decline. If accepted,
                the order will be assigned to you with the confirmed delivery time.
              </p>
            </div>

            <div className="flex justify-end gap-3">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={acceptOfferMutation.isPending}
                data-testid="button-cancel"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={acceptOfferMutation.isPending}
                data-testid="button-submit-quote"
              >
                {acceptOfferMutation.isPending ? "Submitting..." : "Send Quote"}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
