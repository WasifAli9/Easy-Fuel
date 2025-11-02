import { useEffect, useState } from "react";
import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
import { Icon } from "leaflet";
import "leaflet/dist/leaflet.css";
import { Truck, MapPin } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

// Fix Leaflet's default icon path issues with Vite
import markerIcon2x from "leaflet/dist/images/marker-icon-2x.png";
import markerIcon from "leaflet/dist/images/marker-icon.png";
import markerShadow from "leaflet/dist/images/marker-shadow.png";

// @ts-ignore
delete Icon.Default.prototype._getIconUrl;
Icon.Default.mergeOptions({
  iconRetinaUrl: markerIcon2x,
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
});

interface DriverLocationMapProps {
  orderId: string;
  deliveryLat?: number;
  deliveryLng?: number;
  className?: string;
}

interface DriverLocation {
  latitude: number | null;
  longitude: number | null;
  driverName: string;
  orderState: string;
}

// Component to recenter map when location updates
function RecenterMap({ lat, lng }: { lat: number; lng: number }) {
  const map = useMap();
  useEffect(() => {
    map.setView([lat, lng], map.getZoom());
  }, [lat, lng, map]);
  return null;
}

export function DriverLocationMap({
  orderId,
  deliveryLat,
  deliveryLng,
  className = "",
}: DriverLocationMapProps) {
  const [driverLocation, setDriverLocation] = useState<DriverLocation | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch driver location
  const fetchDriverLocation = async () => {
    try {
      const response = await fetch(`/api/customer/orders/${orderId}/driver-location`);
      
      if (!response.ok) {
        const errorData = await response.json();
        
        // If no driver assigned or not found, don't show error - just no map
        if (response.status === 404) {
          setDriverLocation(null);
          setError(null);
          return;
        }
        
        throw new Error(errorData.error || "Failed to fetch driver location");
      }

      const data = await response.json();
      setDriverLocation(data);
      setError(null);
    } catch (err: any) {
      console.error("Error fetching driver location:", err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Initial fetch and polling
  useEffect(() => {
    fetchDriverLocation();

    // Poll every 10 seconds for real-time updates
    const interval = setInterval(fetchDriverLocation, 10000);

    return () => clearInterval(interval);
  }, [orderId]);

  if (loading) {
    return (
      <Card className={className}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Truck className="h-5 w-5" />
            Driver Location
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center h-64">
            <p className="text-muted-foreground">Loading map...</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className={className}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Truck className="h-5 w-5" />
            Driver Location
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center h-64">
            <p className="text-destructive">{error}</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  // If no driver location available
  if (!driverLocation || !driverLocation.latitude || !driverLocation.longitude) {
    return (
      <Card className={className}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Truck className="h-5 w-5" />
            Driver Location
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center h-64">
            <p className="text-muted-foreground">
              Driver location will appear here once they're on the way
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const driverLat = driverLocation.latitude;
  const driverLng = driverLocation.longitude;

  // Use driver location as center, or delivery location if available
  const centerLat = driverLat;
  const centerLng = driverLng;

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Truck className="h-5 w-5" />
            Driver Location
          </div>
          <Badge variant="default" className="bg-primary">
            Live Tracking
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <MapPin className="h-4 w-4" />
            <span>Updates every 10 seconds</span>
          </div>

          <div className="rounded-lg overflow-hidden border" style={{ height: "400px" }}>
            <MapContainer
              center={[centerLat, centerLng]}
              zoom={14}
              style={{ height: "100%", width: "100%" }}
              data-testid="map-driver-location"
            >
              <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              />
              
              {/* Driver marker */}
              <Marker position={[driverLat, driverLng]}>
                <Popup>
                  <div className="text-center">
                    <p className="font-semibold">{driverLocation.driverName}</p>
                    <p className="text-sm text-muted-foreground">Your driver</p>
                  </div>
                </Popup>
              </Marker>

              {/* Delivery location marker (if available) */}
              {deliveryLat && deliveryLng && (
                <Marker position={[deliveryLat, deliveryLng]}>
                  <Popup>
                    <div className="text-center">
                      <p className="font-semibold">Delivery Location</p>
                      <p className="text-sm text-muted-foreground">Your address</p>
                    </div>
                  </Popup>
                </Marker>
              )}

              {/* Recenter map when driver location updates */}
              <RecenterMap lat={driverLat} lng={driverLng} />
            </MapContainer>
          </div>

          <div className="text-sm text-muted-foreground pt-2">
            <p className="font-medium text-foreground">
              Driver: {driverLocation.driverName}
            </p>
            <p>Status: {driverLocation.orderState}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
