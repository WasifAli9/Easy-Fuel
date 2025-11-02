import { useEffect, useState } from "react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { MapPin } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface DriverLocationTrackerProps {
  isOnDelivery: boolean; // Driver is currently on delivery
}

export function DriverLocationTracker({ isOnDelivery }: DriverLocationTrackerProps) {
  const [isTracking, setIsTracking] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [locationError, setLocationError] = useState<string | null>(null);
  const { toast } = useToast();

  const updateLocation = async (latitude: number, longitude: number) => {
    try {
      await apiRequest("PUT", "/api/driver/location", { latitude, longitude });
      
      setLastUpdate(new Date());
      setLocationError(null);
    } catch (error: any) {
      console.error("Error updating location:", error);
      setLocationError(error.message || "Failed to update location");
    }
  };

  const getCurrentLocation = () => {
    if (!navigator.geolocation) {
      setLocationError("Geolocation is not supported by your browser");
      toast({
        title: "Error",
        description: "Geolocation is not supported by your browser",
        variant: "destructive",
      });
      return;
    }

    navigator.geolocation.getCurrentPosition(
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
        toast({
          title: "Location Error",
          description: errorMessage,
          variant: "destructive",
        });
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0,
      }
    );
  };

  // Start/stop tracking based on delivery status
  useEffect(() => {
    if (isOnDelivery) {
      setIsTracking(true);
      
      // Update immediately
      getCurrentLocation();
      
      // Then update every 30 seconds
      const interval = setInterval(getCurrentLocation, 30000);
      
      return () => clearInterval(interval);
    } else {
      setIsTracking(false);
      setLastUpdate(null);
      setLocationError(null);
    }
  }, [isOnDelivery]);

  if (!isOnDelivery) {
    return null; // Don't show anything when not on delivery
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <MapPin className="h-5 w-5" />
            GPS Tracking
          </div>
          {isTracking && (
            <Badge variant="default" className="bg-green-600">
              Active
            </Badge>
          )}
        </CardTitle>
        <CardDescription>
          Your location is being shared with the customer
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
          <p className="font-medium">Updates every 30 seconds</p>
          <p className="text-muted-foreground">
            Make sure location services are enabled on your device
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
