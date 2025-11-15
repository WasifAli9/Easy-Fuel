import { useQuery } from "@tanstack/react-query";
import { Truck, MapPin, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface DriverLocationIndicatorProps {
  orderId: string;
  orderState: string;
}

interface DriverLocation {
  latitude: number | null;
  longitude: number | null;
  driverName: string;
  orderState: string;
}

export function DriverLocationIndicator({ orderId, orderState }: DriverLocationIndicatorProps) {
  // Only fetch location if order is en_route
  const isEnRoute = orderState === "en_route";
  
  const { data: driverLocation, isLoading, error } = useQuery<DriverLocation>({
    queryKey: ["/api/orders", orderId, "driver-location"],
    enabled: isEnRoute && !!orderId,
    refetchInterval: 30000, // Poll every 30 seconds
    retry: false,
  });

  // Don't show anything if order is not en_route
  if (!isEnRoute) {
    return null;
  }

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-3 w-3 animate-spin" />
        <span>Loading driver location...</span>
      </div>
    );
  }

  if (error) {
    const is404 = (error as any)?.message?.includes("404") || (error as any)?.statusCode === 404;
    if (is404) {
      return null; // No driver assigned yet
    }
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <MapPin className="h-3 w-3" />
        <span>Location unavailable</span>
      </div>
    );
  }

  if (!driverLocation || !driverLocation.latitude || !driverLocation.longitude) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <MapPin className="h-3 w-3" />
        <span>Waiting for driver location...</span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <Badge variant="outline" className="bg-primary/10 text-primary border-primary/20">
        <Truck className="h-3 w-3 mr-1" />
        <span className="text-xs">Driver Location: Live</span>
      </Badge>
      <span className="text-xs text-muted-foreground">
        {driverLocation.latitude.toFixed(4)}, {driverLocation.longitude.toFixed(4)}
      </span>
    </div>
  );
}

