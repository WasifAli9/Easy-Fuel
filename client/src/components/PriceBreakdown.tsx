import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { useCurrency } from "@/hooks/use-currency";
import { formatCurrency } from "@/lib/utils";
import { formatCurrency } from "@/lib/utils";

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
  const { currency } = useCurrency();
  
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
          <span>{formatCurrency(fuelPrice, currency)}</span>
        </div>
        <div className="flex justify-between text-sm" data-testid="price-delivery">
          <span className="text-muted-foreground">Delivery Fee</span>
          <span>{formatCurrency(deliveryFee, currency)}</span>
        </div>
        <div className="flex justify-between text-sm" data-testid="price-service">
          <span className="text-muted-foreground">Service Fee</span>
          <span>{formatCurrency(serviceFee, currency)}</span>
        </div>
        <Separator />
        <div className="flex justify-between font-bold text-lg pt-1" data-testid="price-total">
          <span>Total</span>
          <span className="text-primary">{formatCurrency(total, currency)}</span>
        </div>
      </CardContent>
    </Card>
  );
}
