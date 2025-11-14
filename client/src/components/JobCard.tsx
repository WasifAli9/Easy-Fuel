import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { FuelTypeIcon } from "./FuelTypeIcon";
import { MapPin, Clock, Navigation, Star } from "lucide-react";
import { useCurrency } from "@/hooks/use-currency";

interface JobCardProps {
  id: string;
  fuelType: string;
  litres: number;
  pickupLocation: string;
  dropLocation: string;
  distance: number;
  earnings: number;
  expiresIn?: number; // seconds
  isPremium?: boolean;
  onAccept?: () => void;
  onReject?: () => void;
}

export function JobCard({
  id,
  fuelType,
  litres,
  pickupLocation,
  dropLocation,
  distance,
  earnings,
  expiresIn,
  isPremium = false,
  onAccept,
  onReject
}: JobCardProps) {
  const [timeLeft, setTimeLeft] = useState(expiresIn || 0);
  const { currencySymbol } = useCurrency();

  useEffect(() => {
    if (!expiresIn) return;
    
    const timer = setInterval(() => {
      setTimeLeft((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);

    return () => clearInterval(timer);
  }, [expiresIn]);

  const formatTime = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;

    if (hours > 0) {
      return `${hours}h ${mins.toString().padStart(2, "0")}m`;
    }

    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  return (
    <Card className="hover-elevate" data-testid={`card-job-${id}`}>
      <CardHeader className="flex flex-row items-start justify-between gap-2 space-y-0 pb-3">
        <div className="flex items-center gap-2">
          <FuelTypeIcon fuelType={fuelType} />
          <div>
            <p className="font-semibold" data-testid={`text-fuel-type-${id}`}>{fuelType}</p>
            <p className="text-sm text-muted-foreground">{litres}L</p>
          </div>
        </div>
        {expiresIn && (
          <Badge 
            variant="outline" 
            className={`${timeLeft < 30 ? 'animate-pulse bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200' : 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200'}`}
            data-testid={`badge-timer-${id}`}
          >
            <Clock className="h-3 w-3 mr-1" />
            {formatTime(timeLeft)}
          </Badge>
        )}
        {isPremium && (
          <Badge variant="outline" className="bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200 border-amber-300 dark:border-amber-800">
            <Star className="h-3 w-3 mr-1 fill-current" />
            Priority
          </Badge>
        )}
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="space-y-2">
          <div className="flex items-start gap-2 text-sm">
            <MapPin className="h-4 w-4 mt-0.5 text-green-600 dark:text-green-400" />
            <div>
              <p className="text-xs text-muted-foreground">Pickup</p>
              <p className="font-medium" data-testid={`text-pickup-${id}`}>{pickupLocation}</p>
            </div>
          </div>
          <div className="flex items-start gap-2 text-sm">
            <MapPin className="h-4 w-4 mt-0.5 text-red-600 dark:text-red-400" />
            <div>
              <p className="text-xs text-muted-foreground">Dropoff</p>
              <p className="font-medium" data-testid={`text-dropoff-${id}`}>{dropLocation}</p>
            </div>
          </div>
        </div>
        <div className="flex items-center justify-between pt-2 border-t">
          <div className="flex items-center gap-2 text-sm">
            <Navigation className="h-4 w-4 text-muted-foreground" />
            <span className="text-muted-foreground">{distance} km</span>
          </div>
          <div className="text-right">
            <p className="text-xs text-muted-foreground">Earnings</p>
            <p className="font-bold text-lg text-primary" data-testid={`text-earnings-${id}`}>{currencySymbol} {earnings.toFixed(2)}</p>
          </div>
        </div>
      </CardContent>
      {(onAccept || onReject) && (
        <CardFooter className="flex gap-2 pt-0">
          <Button 
            variant="outline" 
            className="flex-1"
            onClick={onReject}
            data-testid={`button-reject-${id}`}
          >
            Reject
          </Button>
          <Button 
            className="flex-1"
            onClick={onAccept}
            data-testid={`button-accept-${id}`}
          >
            Accept Job
          </Button>
        </CardFooter>
      )}
    </Card>
  );
}
