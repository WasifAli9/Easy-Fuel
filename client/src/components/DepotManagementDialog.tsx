import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useEffect, useState } from "react";
import { MapPin, Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";

const southAfricanProvinces = [
  "Eastern Cape",
  "Free State",
  "Gauteng",
  "KwaZulu-Natal",
  "Limpopo",
  "Mpumalanga",
  "Northern Cape",
  "North West",
  "Western Cape",
];

const depotSchema = z.object({
  name: z.string().min(1, "Depot name is required"),
  address_street: z.string().optional(),
  address_city: z.string().optional(),
  address_province: z.string().optional(),
  address_postal_code: z.string().optional(),
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
  open_hours: z.string().optional(),
  is_active: z.boolean().default(true),
  notes: z.string().optional(),
});

type DepotFormData = z.infer<typeof depotSchema>;

interface DepotManagementDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  depot?: any;
}

export function DepotManagementDialog({
  open,
  onOpenChange,
  depot,
}: DepotManagementDialogProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isGettingLocation, setIsGettingLocation] = useState(false);

  const form = useForm<DepotFormData>({
    resolver: zodResolver(depotSchema),
    defaultValues: {
      name: depot?.name || "",
      address_street: depot?.address_street || "",
      address_city: depot?.address_city || "",
      address_province: depot?.address_province || "",
      address_postal_code: depot?.address_postal_code || "",
      lat: depot?.lat || 0,
      lng: depot?.lng || 0,
      open_hours: typeof depot?.open_hours === 'object' ? JSON.stringify(depot.open_hours) : depot?.open_hours || "",
      is_active: depot?.is_active !== undefined ? depot.is_active : true,
      notes: depot?.notes || "",
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
        form.setValue("lat", parseFloat(position.coords.latitude.toFixed(6)));
        form.setValue("lng", parseFloat(position.coords.longitude.toFixed(6)));
        setIsGettingLocation(false);
        toast({
          title: "Location detected",
          description: "Your current location has been set",
        });
      },
      (error) => {
        console.error("Error getting location:", error);
        let errorMessage = "Failed to get your current location. Please enter manually.";
        
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
        
        toast({
          title: "Error",
          description: errorMessage,
          variant: "destructive",
        });
        setIsGettingLocation(false);
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0,
      }
    );
  };

  const createDepotMutation = useMutation({
    mutationFn: async (data: DepotFormData) => {
      let openHours = {};
      if (data.open_hours) {
        try {
          openHours = JSON.parse(data.open_hours);
        } catch (e) {
          // If not valid JSON, store as simple string description
          openHours = { description: data.open_hours };
        }
      }
      const payload = {
        ...data,
        open_hours: openHours,
      };
      return apiRequest("POST", "/api/supplier/depots", payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/supplier/depots"] });
      toast({
        title: "Success",
        description: "Depot created successfully",
      });
      onOpenChange(false);
      form.reset({
        name: "",
        address_street: "",
        address_city: "",
        address_province: "",
        address_postal_code: "",
        lat: 0,
        lng: 0,
        open_hours: "",
        is_active: true,
        notes: "",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const updateDepotMutation = useMutation({
    mutationFn: async (data: DepotFormData) => {
      let openHours = {};
      if (data.open_hours) {
        try {
          openHours = JSON.parse(data.open_hours);
        } catch (e) {
          // If not valid JSON, store as simple string description
          openHours = { description: data.open_hours };
        }
      }
      const payload = {
        ...data,
        open_hours: openHours,
      };
      return apiRequest("PATCH", `/api/supplier/depots/${depot.id}`, payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/supplier/depots"] });
      toast({
        title: "Success",
        description: "Depot updated successfully",
      });
      onOpenChange(false);
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Reset form when depot changes or dialog opens
  useEffect(() => {
    if (open) {
      if (depot) {
        // Editing existing depot
        form.reset({
          name: depot.name || "",
          address_street: depot.address_street || "",
          address_city: depot.address_city || "",
          address_province: depot.address_province || "",
          address_postal_code: depot.address_postal_code || "",
          lat: depot.lat || 0,
          lng: depot.lng || 0,
          open_hours: typeof depot.open_hours === 'object' ? JSON.stringify(depot.open_hours) : depot.open_hours || "",
          is_active: depot.is_active !== undefined ? depot.is_active : true,
          notes: depot.notes || "",
        });
      } else {
        // Creating new depot
        form.reset({
          name: "",
          address_street: "",
          address_city: "",
          address_province: "",
          address_postal_code: "",
          lat: 0,
          lng: 0,
          open_hours: "",
          is_active: true,
          notes: "",
        });
      }
    }
  }, [open, depot, form]);

  const onSubmit = (data: DepotFormData) => {
    if (depot) {
      updateDepotMutation.mutate(data);
    } else {
      createDepotMutation.mutate(data);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle data-testid="dialog-title-depot">
            {depot ? "Edit Depot" : "Add New Depot"}
          </DialogTitle>
          <DialogDescription>
            {depot 
              ? "Update the depot information below. Changes will be saved immediately."
              : "Fill in the details below to create a new depot. Make sure to provide accurate location coordinates."}
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Depot Name</FormLabel>
                  <FormControl>
                    <Input
                      data-testid="input-depot-name"
                      placeholder="Shell Industrial Depot"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="address_street"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Street Address</FormLabel>
                    <FormControl>
                      <Input
                        data-testid="input-depot-street"
                        placeholder="45 Industrial Ave"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="address_city"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>City</FormLabel>
                    <FormControl>
                      <Input
                        data-testid="input-depot-city"
                        placeholder="Johannesburg"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="address_province"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Province</FormLabel>
                    <Select
                      onValueChange={field.onChange}
                      defaultValue={field.value}
                    >
                      <FormControl>
                        <SelectTrigger data-testid="select-depot-province">
                          <SelectValue placeholder="Select province" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {southAfricanProvinces.map((province) => (
                          <SelectItem key={province} value={province}>
                            {province}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="address_postal_code"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Postal Code</FormLabel>
                    <FormControl>
                      <Input
                        data-testid="input-depot-postal"
                        placeholder="2000"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="lat"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Latitude</FormLabel>
                    <FormControl>
                      <Input
                        data-testid="input-depot-lat"
                        type="number"
                        step="any"
                        placeholder="-26.2041"
                        {...field}
                        value={field.value || ""}
                        onChange={(e) => field.onChange(e.target.value ? parseFloat(e.target.value) : 0)}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="lng"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Longitude</FormLabel>
                    <FormControl>
                      <Input
                        data-testid="input-depot-lng"
                        type="number"
                        step="any"
                        placeholder="28.0473"
                        {...field}
                        value={field.value || ""}
                        onChange={(e) => field.onChange(e.target.value ? parseFloat(e.target.value) : 0)}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* Get Live Coordinates Button */}
            <div className="flex justify-center py-2">
              <Button
                type="button"
                variant="outline"
                onClick={handleGetCurrentLocation}
                disabled={isGettingLocation}
                data-testid="button-get-live-coordinates"
              >
                {isGettingLocation ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Getting Location...
                  </>
                ) : (
                  <>
                    <MapPin className="h-4 w-4 mr-2" />
                    Get Live Coordinates
                  </>
                )}
              </Button>
            </div>

            <FormField
              control={form.control}
              name="open_hours"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Operating Hours</FormLabel>
                  <FormControl>
                    <Input
                      data-testid="input-depot-hours"
                      placeholder='Mon-Fri: 6AM-6PM, Sat: 8AM-2PM or {"monday": "6AM-6PM"}'
                      {...field}
                    />
                  </FormControl>
                  <p className="text-sm text-muted-foreground">
                    Enter plain text (e.g., "Mon-Fri: 8AM-5PM") or JSON format
                  </p>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="is_active"
              render={({ field }) => (
                <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                  <div className="space-y-0.5">
                    <FormLabel className="text-base">Active Status</FormLabel>
                    <p className="text-sm text-muted-foreground">
                      Inactive depots won't be visible to drivers
                    </p>
                  </div>
                  <FormControl>
                    <Switch
                      checked={field.value}
                      onCheckedChange={field.onChange}
                      data-testid="switch-depot-active"
                    />
                  </FormControl>
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Notes</FormLabel>
                  <FormControl>
                    <Textarea
                      data-testid="input-depot-notes"
                      placeholder="Additional information about this depot..."
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                data-testid="button-cancel-depot"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={createDepotMutation.isPending || updateDepotMutation.isPending}
                data-testid="button-save-depot"
              >
                {createDepotMutation.isPending || updateDepotMutation.isPending
                  ? "Saving..."
                  : depot
                  ? "Update Depot"
                  : "Create Depot"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
