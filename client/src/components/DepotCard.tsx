import { Card, CardContent, CardHeader, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { MapPin, Clock, Edit, DollarSign } from "lucide-react";

interface FuelPrice {
  type: string;
  pricePerLitre: number;
}

interface DepotCardProps {
  id: string;
  name: string;
  location: string;
  coordinates?: { lat: number; lng: number };
  openHours: string;
  fuelPrices: FuelPrice[];
  isActive?: boolean;
  onEdit?: () => void;
}

export function DepotCard({
  id,
  name,
  location,
  openHours,
  fuelPrices,
  isActive = true,
  onEdit
}: DepotCardProps) {
  return (
    <Card className="hover-elevate" data-testid={`card-depot-${id}`}>
      <CardHeader className="flex flex-row items-start justify-between gap-2 space-y-0 pb-3">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <h3 className="font-semibold" data-testid={`text-depot-name-${id}`}>{name}</h3>
            <Badge 
              variant="outline" 
              className={isActive 
                ? "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-200" 
                : "bg-gray-100 text-gray-800 dark:bg-gray-950 dark:text-gray-200"
              }
            >
              {isActive ? "Active" : "Inactive"}
            </Badge>
          </div>
          <div className="flex items-start gap-2 text-sm text-muted-foreground">
            <MapPin className="h-4 w-4 mt-0.5" />
            <span data-testid={`text-location-${id}`}>{location}</span>
          </div>
        </div>
        {onEdit && (
          <Button 
            variant="ghost" 
            size="icon"
            onClick={onEdit}
            data-testid={`button-edit-${id}`}
          >
            <Edit className="h-4 w-4" />
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center gap-2 text-sm">
          <Clock className="h-4 w-4 text-muted-foreground" />
          <span className="text-muted-foreground">{openHours}</span>
        </div>
        <div className="space-y-2 pt-2 border-t">
          <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
            <DollarSign className="h-4 w-4" />
            <span className="font-medium">Fuel Prices</span>
          </div>
          {fuelPrices.map((fuel, idx) => (
            <div key={idx} className="flex items-center justify-between text-sm" data-testid={`price-${fuel.type}-${id}`}>
              <span className="text-muted-foreground">{fuel.type}</span>
              <span className="font-semibold">R {fuel.pricePerLitre.toFixed(2)}/L</span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
