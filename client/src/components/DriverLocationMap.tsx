import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
import { Icon, divIcon } from "leaflet";
import "leaflet/dist/leaflet.css";
import { Truck, MapPin } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useWebSocket } from "@/hooks/useWebSocket";

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
  lastUpdate?: string | null;
  locationSource?: "realtime" | "last_known" | "default";
}

// Component to recenter map when location updates
function RecenterMap({ lat, lng }: { lat: number; lng: number }) {
  const map = useMap();
  useEffect(() => {
    map.setView([lat, lng], map.getZoom());
  }, [lat, lng, map]);
  return null;
}

// Create custom car/truck icon for driver location (memoized)
const carIcon = (() => {
  // Create SVG truck icon
  const iconHtml = `
    <div style="
      background-color: #10b981;
      border-radius: 50%;
      width: 40px;
      height: 40px;
      display: flex;
      align-items: center;
      justify-content: center;
      border: 3px solid white;
      box-shadow: 0 2px 8px rgba(0,0,0,0.3);
    ">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2"></path>
        <path d="M15 18H9"></path>
        <path d="M19 18h2a1 1 0 0 0 1-1v-3.28a1 1 0 0 0-.684-.948l-1.923-.641a1 1 0 0 1-.578-.502L17 10"></path>
        <circle cx="7" cy="18" r="2"></circle>
        <circle cx="17" cy="18" r="2"></circle>
      </svg>
    </div>
  `;

  return divIcon({
    html: iconHtml,
    className: 'custom-car-icon',
    iconSize: [40, 40],
    iconAnchor: [20, 20],
    popupAnchor: [0, -20],
  });
})();

export function DriverLocationMap({
  orderId,
  deliveryLat,
  deliveryLng,
  className = "",
}: DriverLocationMapProps) {
  const queryClient = useQueryClient();
  
  // Fetch driver location using TanStack Query with real-time polling (every 0.5 seconds)
  const { data: driverLocation, isLoading: loading, error } = useQuery<DriverLocation>({
    queryKey: ["/api/orders", orderId, "driver-location"],
    enabled: !!orderId,
    refetchInterval: 500, // Poll every 0.5 seconds for real-time GPS tracking
    retry: false, // Don't retry on 404 (no driver assigned)
  });

  // Listen for real-time location updates via WebSocket
  useWebSocket((message) => {
    if (message.type === "location_update" && message.payload?.orderId === orderId) {
      // Update the query cache with new location immediately
      queryClient.setQueryData<DriverLocation>(["/api/orders", orderId, "driver-location"], (oldData) => {
        if (!oldData) return oldData;
        return {
          ...oldData,
          latitude: message.payload.latitude,
          longitude: message.payload.longitude,
          lastUpdate: message.payload.timestamp || new Date().toISOString(),
        };
      });
    }
  });

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

  // Show error message if there's a non-404 error
  if (error) {
    const is404 = (error as any)?.message?.includes("404") || (error as any)?.statusCode === 404;
    if (!is404) {
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
              <p className="text-destructive">
                {(error as any)?.message || "Failed to load driver location"}
              </p>
            </div>
          </CardContent>
        </Card>
      );
    }
  }

  // If no driver location available yet, show placeholder with message
  if (!driverLocation || !driverLocation.latitude || !driverLocation.longitude) {
    return (
      <Card className={className}>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Truck className="h-5 w-5" />
              Driver Location
            </div>
            <Badge variant="outline">Waiting for GPS</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center h-64 space-y-3">
            <Truck className="h-12 w-12 text-muted-foreground" />
            <div className="text-center space-y-1">
              <p className="font-medium">Location tracking will start soon</p>
              <p className="text-sm text-muted-foreground">
                The driver's location will appear here once GPS tracking begins
              </p>
            </div>
            {deliveryLat && deliveryLng && (
              <div className="rounded-lg overflow-hidden border" style={{ height: "300px", width: "100%" }}>
                <MapContainer
                  center={[deliveryLat, deliveryLng]}
                  zoom={13}
                  style={{ height: "100%", width: "100%" }}
                >
                  <TileLayer
                    attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                  />
                  {/* Show only delivery location while waiting for driver */}
                  <Marker position={[deliveryLat, deliveryLng]}>
                    <Popup>
                      <div className="text-center">
                        <p className="font-semibold">Delivery Location</p>
                        <p className="text-sm text-muted-foreground">Your address</p>
                      </div>
                    </Popup>
                  </Marker>
                </MapContainer>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    );
  }

  const driverLat = driverLocation.latitude;
  const driverLng = driverLocation.longitude;

  // Always use driver's GPS location as center (not delivery address)
  const centerLat = driverLat;
  const centerLng = driverLng;

  // Debug: Log the coordinates being used (only in development)
  if (process.env.NODE_ENV === 'development') {
    console.log("Driver Location Map - Using coordinates:", {
      driverLat,
      driverLng,
      deliveryLat,
      deliveryLng,
      driverName: driverLocation.driverName,
      lastUpdate: driverLocation.lastUpdate,
    });
  }

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
            <span>Real-time GPS tracking (updates every 0.5 seconds)</span>
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
              
              {/* Driver marker with car icon */}
              <Marker position={[driverLat, driverLng]} icon={carIcon}>
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

          <div className="text-sm text-muted-foreground pt-2 space-y-1">
            <p className="font-medium text-foreground">
              Driver: {driverLocation.driverName}
            </p>
            <p>Status: {driverLocation.orderState}</p>
            <p className="text-xs">
              GPS Coordinates: {driverLat.toFixed(6)}, {driverLng.toFixed(6)}
            </p>
            {driverLocation.locationSource === "realtime" && (
              <Badge variant="default" className="bg-green-600 text-xs">
                Live GPS Tracking
              </Badge>
            )}
            {driverLocation.locationSource === "last_known" && (
              <Badge variant="outline" className="text-xs">
                Last Known Location
              </Badge>
            )}
            {driverLocation.locationSource === "default" && (
              <Badge variant="outline" className="text-xs">
                Default Location (from settings)
              </Badge>
            )}
            {driverLocation.lastUpdate && (
              <p className="text-xs">
                Last Update: {new Date(driverLocation.lastUpdate).toLocaleTimeString()}
              </p>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
