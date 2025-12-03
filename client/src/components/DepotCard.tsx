import { Card, CardContent, CardHeader, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { MapPin, Clock, Edit, Trash2, Fuel } from "lucide-react";
import { useCurrency } from "@/hooks/use-currency";

interface FuelPriceTier {
  id: string;
  type: string;
  pricePerLitre: number;
  minLitres: number;
}

interface FuelPrice {
  type: string;
  pricePerLitre: number;
  tiers?: FuelPriceTier[];
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
  onDelete?: () => void;
}

export function DepotCard({
  id,
  name,
  location,
  openHours,
  fuelPrices,
  isActive = true,
  onEdit,
  onDelete
}: DepotCardProps) {
  const { currencySymbol } = useCurrency();

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
        <div className="flex gap-1">
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
          {onDelete && (
            <Button
              variant="ghost"
              size="icon"
              onClick={onDelete}
              data-testid={`button-delete-${id}`}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center gap-2 text-sm">
          <Clock className="h-4 w-4 text-muted-foreground" />
          <span className="text-muted-foreground">{openHours}</span>
        </div>
        <div className="space-y-3 pt-2 border-t">
          <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
            <Fuel className="h-4 w-4" />
            <span className="font-medium">Fuel Prices (Tiered)</span>
          </div>
          {(() => {
            // Group prices by fuel type
            const groupedByType = fuelPrices.reduce((acc: Record<string, FuelPrice[]>, fuel) => {
              const type = fuel.type;
              if (!acc[type]) {
                acc[type] = [];
              }
              acc[type].push(fuel);
              return acc;
            }, {});

            return Object.entries(groupedByType).map(([fuelType, prices]) => {
              // If tiers exist, use them; otherwise use the single price
              const hasTiers = prices.some(p => p.tiers && p.tiers.length > 0);

              if (hasTiers) {
                // Get all tiers for this fuel type and sort by minLitres (matching driver portal logic exactly)
                const allTiers = prices
                  .flatMap(p => p.tiers || [])
                  .sort((a, b) => {
                    // Match driver portal sorting logic exactly
                    const aMin = parseFloat(a.minLitres?.toString() || "0");
                    const bMin = parseFloat(b.minLitres?.toString() || "0");
                    return aMin - bMin;
                  });

                const getTierRange = (tier: FuelPriceTier, index: number) => {
                  // Match driver portal range calculation logic exactly
                  const minLitres = Number(tier.minLitres) || 0;
                  const nextTier = allTiers[index + 1];
                  if (nextTier) {
                    const nextMin = Number(nextTier.minLitres) || 0;
                    if (nextMin > minLitres) {
                      return `${minLitres}L - ${nextMin - 1}L`;
                    }
                  }
                  return `${minLitres}L+`;
                };

                return (
                  <div key={fuelType} className="border-2 rounded-lg p-3 bg-card shadow-sm space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="font-semibold text-sm">{fuelType}</div>
                    </div>
                    <div className="space-y-1.5 pt-2 border-t">
                      <div className="text-xs text-muted-foreground mb-1">Pricing Tiers:</div>
                      {allTiers.map((tier, index) => (
                        <div
                          key={tier.id}
                          className="flex justify-between items-center text-xs bg-muted/50 rounded px-2 py-1.5"
                          data-testid={`price-tier-${tier.id}-${id}`}
                        >
                          <span className="text-muted-foreground font-medium">{getTierRange(tier, index)}:</span>
                          <span className="font-semibold text-foreground">
                            {currencySymbol}{tier.pricePerLitre.toFixed(2)}/L
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              } else {
                // Fallback to single price display (backward compatibility)
                return (
                  <div key={fuelType} className="flex items-center justify-between text-sm pb-2 border-b last:border-b-0" data-testid={`price-${fuelType}-${id}`}>
                    <span className="text-muted-foreground">{fuelType}</span>
                    <span className="font-semibold">{currencySymbol} {prices[0].pricePerLitre.toFixed(2)}/L</span>
                  </div>
                );
              }
            });
          })()}
        </div>
      </CardContent>
    </Card>
  );
}
