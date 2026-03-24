import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { MapPin, Save, Loader2 } from "lucide-react";
import { Link } from "wouter";

interface DriverPreferences {
  jobRadiusPreferenceMiles: number;
  effectiveRadiusMiles?: number;
  maxRadiusMiles: number;
  subscriptionTier?: string | null;
  subscriptionPlanName?: string | null;
  currentLat: number | null;
  currentLng: number | null;
}

export function DriverPreferencesManager() {
  const { toast } = useToast();
  const [latitude, setLatitude] = useState<string>("");
  const [longitude, setLongitude] = useState<string>("");
  const [isGettingLocation, setIsGettingLocation] = useState(false);

  // Fetch current preferences (radius is set by subscription plan, not editable)
  const { data: preferences, isLoading } = useQuery<DriverPreferences>({
    queryKey: ["/api/driver/preferences"],
  });

  useEffect(() => {
    if (preferences) {
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
    const latValue = parseFloat(latitude);
    const lngValue = parseFloat(longitude);

    if (isNaN(latValue) || isNaN(lngValue)) {
      toast({
        title: "Invalid location",
        description: "Please provide valid latitude and longitude coordinates",
        variant: "destructive",
      });
      return;
    }

    updatePreferencesMutation.mutate({
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
          Set your home location. Your job pickup radius is set automatically by your subscription plan.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Read-only: radius is determined by subscription plan */}
        <div className="rounded-lg border bg-muted/30 p-4">
          <p className="text-sm font-medium">Job pickup radius</p>
          {(preferences?.maxRadiusMiles ?? 0) > 0 ? (
            <p className="text-sm text-muted-foreground mt-1">
              <span className="font-semibold text-foreground">{preferences?.effectiveRadiusMiles ?? preferences?.maxRadiusMiles ?? 0} miles</span>
              {" "}(based on your {preferences?.subscriptionPlanName ?? "subscription"} plan). Only jobs within this distance will be shown.
            </p>
          ) : (
            <p className="text-sm text-muted-foreground mt-1">
              Subscribe to get a job pickup radius and accept orders.
            </p>
          )}
          {(preferences?.maxRadiusMiles ?? 0) === 0 && (
            <Link href="/driver/subscription">
              <Button type="button" variant="outline" size="sm" className="mt-3">
                View plans & subscribe
              </Button>
            </Link>
          )}
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
