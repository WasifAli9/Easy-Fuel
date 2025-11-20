import { useEffect, useState } from "react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { MapPin } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface DriverLocationTrackerProps {
  isOnDelivery: boolean; // Driver is currently on delivery
  activeOrderId?: string | null; // Active en_route order ID
}

export function DriverLocationTracker({ isOnDelivery, activeOrderId }: DriverLocationTrackerProps) {
  const [isTracking, setIsTracking] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [locationError, setLocationError] = useState<string | null>(null);
  const { toast } = useToast();

  const updateLocation = async (latitude: number, longitude: number) => {
    try {
      // Include orderId if available so the location is associated with the order
      const payload: any = { latitude, longitude };
      if (activeOrderId) {
        payload.orderId = activeOrderId;
      }
      
      await apiRequest("PUT", "/api/driver/location", payload);
      
      setLastUpdate(new Date());
      setLocationError(null);
      console.log("Location updated:", { latitude, longitude, orderId: activeOrderId });
    } catch (error: any) {
      console.error("Error updating location:", error);
      setLocationError(error.message || "Failed to update location");
    }
  };

  // Start/stop tracking based on delivery status
  useEffect(() => {
    if (!navigator.geolocation) {
      setLocationError("Geolocation is not supported by your browser");
      toast({
        title: "Error",
        description: "Geolocation is not supported by your browser",
        variant: "destructive",
      });
      return;
    }

    if (isOnDelivery) {
      setIsTracking(true);
      
      // Use watchPosition for continuous real-time GPS tracking (more efficient than polling)
      const watchId = navigator.geolocation.watchPosition(
        (position) => {
          updateLocation(position.coords.latitude, position.coords.longitude);
        },
        (error) => {
          console.error("Geolocation error:", error);
          let errorMessage = "Failed to get your location";
          
          switch (error.code) {
            case error.PERMISSION_DENIED:
              errorMessage = "Location permission denied. Please enable location access in your browser settings.";
              break;
            case error.POSITION_UNAVAILABLE:
              errorMessage = "Location information unavailable";
              break;
            case error.TIMEOUT:
              errorMessage = "Location request timed out";
              break;
          }
          
          setLocationError(errorMessage);
          // Don't show toast on every error, only on permission denied
          if (error.code === error.PERMISSION_DENIED) {
            toast({
              title: "Location Error",
              description: errorMessage,
              variant: "destructive",
            });
          }
        },
        {
          enableHighAccuracy: true, // Use GPS for best accuracy
          timeout: 5000,
          maximumAge: 500, // Accept positions up to 0.5 seconds old
        }
      );
      
      return () => {
        navigator.geolocation.clearWatch(watchId);
        setIsTracking(false);
        setLastUpdate(null);
        setLocationError(null);
      };
    } else {
      setIsTracking(false);
      setLastUpdate(null);
      setLocationError(null);
    }
  }, [isOnDelivery, activeOrderId, toast]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <MapPin className="h-5 w-5" />
            GPS Location Tracking
          </div>
          {isTracking && (
            <Badge variant="default" className="bg-green-600">
              Active
            </Badge>
          )}
        </CardTitle>
        <CardDescription>
          {activeOrderId 
            ? "Your location is being shared with the customer in real-time"
            : "Your location is being tracked. It will be shared when you start a delivery"}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {lastUpdate && (
          <div className="text-sm text-muted-foreground">
            Last updated: {lastUpdate.toLocaleTimeString("en-ZA", {
              hour: "2-digit",
              minute: "2-digit",
              second: "2-digit",
            })}
          </div>
        )}
        
        {locationError && (
          <div className="text-sm text-destructive">
            {locationError}
          </div>
        )}

        <div className="text-sm">
          <p className="font-medium">Real-time GPS tracking (updates every 0.5 seconds)</p>
          <p className="text-muted-foreground">
            Make sure location services are enabled on your device
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
