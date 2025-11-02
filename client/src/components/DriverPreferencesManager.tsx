import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { MapPin, Save, Loader2 } from "lucide-react";

interface DriverPreferences {
  jobRadiusPreferenceMiles: number;
  currentLat: number | null;
  currentLng: number | null;
}

export function DriverPreferencesManager() {
  const { toast } = useToast();
  const [radius, setRadius] = useState<string>("");
  const [latitude, setLatitude] = useState<string>("");
  const [longitude, setLongitude] = useState<string>("");
  const [isGettingLocation, setIsGettingLocation] = useState(false);

  // Fetch current preferences
  const { data: preferences, isLoading } = useQuery<DriverPreferences>({
    queryKey: ["/api/driver/preferences"],
  });

  // Update state when preferences load
  useEffect(() => {
    if (preferences) {
      setRadius(preferences.jobRadiusPreferenceMiles?.toString() || "20");
      setLatitude(preferences.currentLat?.toString() || "");
      setLongitude(preferences.currentLng?.toString() || "");
    }
  }, [preferences]);

  // Update preferences mutation
  const updatePreferencesMutation = useMutation({
    mutationFn: async (data: Partial<DriverPreferences>) => {
      const response = await apiRequest("PATCH", "/api/driver/preferences", data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/driver/preferences"] });
      toast({
        title: "Preferences updated",
        description: "Your job preferences have been saved successfully",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update preferences",
        variant: "destructive",
      });
    },
  });

  const handleGetCurrentLocation = () => {
    setIsGettingLocation(true);
    
    if (!navigator.geolocation) {
      toast({
        title: "Error",
        description: "Geolocation is not supported by your browser",
        variant: "destructive",
      });
      setIsGettingLocation(false);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLatitude(position.coords.latitude.toFixed(6));
        setLongitude(position.coords.longitude.toFixed(6));
        setIsGettingLocation(false);
        toast({
          title: "Location detected",
          description: "Your current location has been set",
        });
      },
      (error) => {
        console.error("Error getting location:", error);
        toast({
          title: "Error",
          description: "Failed to get your current location. Please enter manually.",
          variant: "destructive",
        });
        setIsGettingLocation(false);
      }
    );
  };

  const handleSave = () => {
    const radiusValue = parseFloat(radius);
    const latValue = parseFloat(latitude);
    const lngValue = parseFloat(longitude);

    if (isNaN(radiusValue) || radiusValue < 1 || radiusValue > 500) {
      toast({
        title: "Invalid radius",
        description: "Radius must be between 1 and 500 miles",
        variant: "destructive",
      });
      return;
    }

    if (isNaN(latValue) || isNaN(lngValue)) {
      toast({
        title: "Invalid location",
        description: "Please provide valid latitude and longitude coordinates",
        variant: "destructive",
      });
      return;
    }

    updatePreferencesMutation.mutate({
      jobRadiusPreferenceMiles: radiusValue,
      currentLat: latValue,
      currentLng: lngValue,
    });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Job Preferences</CardTitle>
        <CardDescription>
          Set your preferred job pickup radius and home location
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Radius Preference */}
        <div className="space-y-2">
          <Label htmlFor="radius">Job Pickup Radius (miles)</Label>
          <Input
            id="radius"
            type="number"
            min="1"
            max="500"
            value={radius}
            onChange={(e) => setRadius(e.target.value)}
            placeholder="20"
            data-testid="input-radius"
          />
          <p className="text-sm text-muted-foreground">
            Only jobs within this distance from your location will be shown
          </p>
        </div>

        {/* Location Settings */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <Label>Your Location</Label>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleGetCurrentLocation}
              disabled={isGettingLocation}
              data-testid="button-get-location"
            >
              {isGettingLocation ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Getting location...
                </>
              ) : (
                <>
                  <MapPin className="h-4 w-4 mr-2" />
                  Use Current Location
                </>
              )}
            </Button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="latitude">Latitude</Label>
              <Input
                id="latitude"
                type="number"
                step="0.000001"
                value={latitude}
                onChange={(e) => setLatitude(e.target.value)}
                placeholder="-26.2041"
                data-testid="input-latitude"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="longitude">Longitude</Label>
              <Input
                id="longitude"
                type="number"
                step="0.000001"
                value={longitude}
                onChange={(e) => setLongitude(e.target.value)}
                placeholder="28.0473"
                data-testid="input-longitude"
              />
            </div>
          </div>
          <p className="text-sm text-muted-foreground">
            This is your home base or preferred starting location for jobs
          </p>
        </div>

        {/* Save Button */}
        <Button
          onClick={handleSave}
          disabled={updatePreferencesMutation.isPending}
          className="w-full sm:w-auto"
          data-testid="button-save-preferences"
        >
          {updatePreferencesMutation.isPending ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Saving...
            </>
          ) : (
            <>
              <Save className="h-4 w-4 mr-2" />
              Save Preferences
            </>
          )}
        </Button>
      </CardContent>
    </Card>
  );
}
