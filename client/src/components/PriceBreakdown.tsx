import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

interface PriceBreakdownProps {
  fuelPrice: number;
  deliveryFee: number;
  serviceFee: number;
  total: number;
  litres?: number;
}

export function PriceBreakdown({ 
  fuelPrice, 
  deliveryFee, 
  serviceFee, 
  total,
  litres 
}: PriceBreakdownProps) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <h3 className="font-semibold">Price Breakdown</h3>
      </CardHeader>
      <CardContent className="space-y-2">
        <div className="flex justify-between text-sm" data-testid="price-fuel">
          <span className="text-muted-foreground">
            Fuel{litres ? ` (${litres}L)` : ''}
          </span>
          <span>R {fuelPrice.toFixed(2)}</span>
        </div>
        <div className="flex justify-between text-sm" data-testid="price-delivery">
          <span className="text-muted-foreground">Delivery Fee</span>
          <span>R {deliveryFee.toFixed(2)}</span>
        </div>
        <div className="flex justify-between text-sm" data-testid="price-service">
          <span className="text-muted-foreground">Service Fee</span>
          <span>R {serviceFee.toFixed(2)}</span>
        </div>
        <Separator />
        <div className="flex justify-between font-bold text-lg pt-1" data-testid="price-total">
          <span>Total</span>
          <span className="text-primary">R {total.toFixed(2)}</span>
        </div>
      </CardContent>
    </Card>
  );
}
