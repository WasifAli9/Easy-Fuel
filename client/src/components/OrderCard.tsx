import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "./StatusBadge";
import { FuelTypeIcon } from "./FuelTypeIcon";
import { MapPin, Calendar, Banknote, Eye } from "lucide-react";
import { useCurrency } from "@/hooks/use-currency";

interface OrderCardProps {
  id: string;
  fuelType: string;
  litres: number;
  location: string;
  date: string;
  totalAmount: number;
  status: "created" | "awaiting_payment" | "paid" | "assigned" | "picked_up" | "en_route" | "delivered" | "cancelled" | "refunded";
  onView?: () => void;
}

export function OrderCard({
  id,
  fuelType,
  litres,
  location,
  date,
  totalAmount,
  status,
  onView
}: OrderCardProps) {
  const { currencySymbol } = useCurrency();
  
  return (
    <Card className="hover-elevate overflow-hidden border-l-4 border-l-primary" data-testid={`card-order-${id}`}>
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-3">
        <div className="flex items-center gap-2">
          <FuelTypeIcon fuelType={fuelType} />
          <div>
            <p className="font-semibold" data-testid={`text-fuel-type-${id}`}>{fuelType}</p>
            <p className="text-sm text-muted-foreground" data-testid={`text-litres-${id}`}>{litres}L</p>
          </div>
        </div>
        <StatusBadge status={status} />
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-start gap-2 text-sm">
          <MapPin className="h-4 w-4 mt-0.5 text-muted-foreground" />
          <span className="text-muted-foreground" data-testid={`text-location-${id}`}>{location}</span>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <Calendar className="h-4 w-4 text-muted-foreground" />
          <span className="text-muted-foreground">{date}</span>
        </div>
        <div className="flex items-center justify-between pt-2 border-t">
          {status === "created" ? (
            <div className="flex items-center gap-2">
              <Banknote className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground" data-testid={`text-amount-${id}`}>Pending driver offers</span>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <Banknote className="h-4 w-4 text-muted-foreground" />
              <span className="font-semibold" data-testid={`text-amount-${id}`}>{currencySymbol} {totalAmount.toFixed(2)}</span>
            </div>
          )}
          <Button 
            variant="ghost" 
            size="sm"
            onClick={onView}
            data-testid={`button-view-${id}`}
          >
            <Eye className="h-4 w-4 mr-1" />
            View
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
