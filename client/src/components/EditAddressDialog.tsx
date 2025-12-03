import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useEffect, useState } from "react";
import { geocodeAddress } from "@/lib/geocoding";
import { MapPin, Loader2 } from "lucide-react";

const addressSchema = z.object({
  label: z.string().min(1, "Label is required"),
  addressStreet: z.string().min(1, "Street address is required"),
  addressCity: z.string().min(1, "City is required"),
  addressProvince: z.string().min(1, "Province is required"),
  addressPostalCode: z.string().min(1, "Postal code is required"),
  addressCountry: z.string().default("South Africa"),
  lat: z.coerce.number(),
  lng: z.coerce.number(),
  accessInstructions: z.string().optional(),
  isDefault: z.boolean().default(false),
});

type AddressFormData = z.infer<typeof addressSchema>;

type DeliveryAddress = {
  id: string;
  label: string;
  address_street: string;
  address_city: string;
  address_province: string;
  address_postal_code: string;
  address_country: string;
  lat: number;
  lng: number;
  access_instructions: string | null;
  is_default: boolean;
};

const SOUTH_AFRICAN_PROVINCES = [
  "Eastern Cape",
  "Free State",
  "Gauteng",
  "KwaZulu-Natal",
  "Limpopo",
  "Mpumalanga",
  "North West",
  "Northern Cape",
  "Western Cape",
];

interface EditAddressDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  address: DeliveryAddress;
}

export function EditAddressDialog({ open, onOpenChange, address }: EditAddressDialogProps) {
  const { toast } = useToast();
  const [isGeocoding, setIsGeocoding] = useState(false);

  const form = useForm<AddressFormData>({
    resolver: zodResolver(addressSchema),
    defaultValues: {
      label: address.label,
      addressStreet: address.address_street,
      addressCity: address.address_city,
      addressProvince: address.address_province,
      addressPostalCode: address.address_postal_code,
      addressCountry: address.address_country,
      lat: address.lat,
      lng: address.lng,
      accessInstructions: address.access_instructions || "",
      isDefault: address.is_default,
    },
  });

  // Update form when address changes
  useEffect(() => {
    form.reset({
      label: address.label,
      addressStreet: address.address_street,
      addressCity: address.address_city,
      addressProvince: address.address_province,
      addressPostalCode: address.address_postal_code,
      addressCountry: address.address_country,
      lat: address.lat,
      lng: address.lng,
      accessInstructions: address.access_instructions || "",
      isDefault: address.is_default,
    });
  }, [address, form]);

  const handleGetLiveLocation = () => {
    setIsGeocoding(true);

    if (!navigator.geolocation) {
      toast({
        title: "Error",
        description: "Geolocation is not supported by your browser",
        variant: "destructive",
      });
      setIsGeocoding(false);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        form.setValue("lat", position.coords.latitude);
        form.setValue("lng", position.coords.longitude);
        toast({
          title: "Success",
          description: "Location updated successfully",
        });
        setIsGeocoding(false);
      },
      (error) => {
        let errorMessage = "Failed to get location";
        if (error.code === error.PERMISSION_DENIED) {
          errorMessage = "Location permission denied. Please enable it in your browser settings.";
        } else if (error.code === error.TIMEOUT) {
          errorMessage = "Location request timed out.";
        }

        toast({
          title: "Error",
          description: errorMessage,
          variant: "destructive",
        });
        setIsGeocoding(false);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const updateMutation = useMutation({
    mutationFn: async (data: AddressFormData) => {
      return apiRequest("PUT", `/api/addresses/${address.id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/addresses"] });
      toast({
        title: "Success",
        description: "Address updated successfully",
      });
      onOpenChange(false);
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update address",
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: AddressFormData) => {
    updateMutation.mutate(data);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit Delivery Address</DialogTitle>
          <DialogDescription>
            Update your delivery address details
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="label"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Label</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="e.g., Home, Office, Warehouse"
                      {...field}
                      data-testid="input-label"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="addressStreet"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Street Address</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="123 Main Street"
                      {...field}
                      data-testid="input-street"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="addressCity"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>City</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="Johannesburg"
                        {...field}
                        data-testid="input-city"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="addressProvince"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Province</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger data-testid="select-province">
                          <SelectValue placeholder="Select province" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {SOUTH_AFRICAN_PROVINCES.map((province) => (
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
            </div>

            <FormField
              control={form.control}
              name="addressPostalCode"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Postal Code</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="2000"
                      {...field}
                      data-testid="input-postal-code"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Geocoding Button */}
            <div className="flex justify-center py-2">
              <Button
                type="button"
                variant="outline"
                onClick={handleGetLiveLocation}
                disabled={isGeocoding}
                data-testid="button-geocode"
              >
                {isGeocoding ? (
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

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="lat"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Latitude</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        step="any"
                        placeholder="-26.2041"
                        {...field}
                        data-testid="input-latitude"
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
                        type="number"
                        step="any"
                        placeholder="28.0473"
                        {...field}
                        data-testid="input-longitude"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="accessInstructions"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Access Instructions (Optional)</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="e.g., Gate code is 1234, Ring bell for entry"
                      {...field}
                      data-testid="textarea-instructions"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="isDefault"
              render={({ field }) => (
                <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                  <FormControl>
                    <Checkbox
                      checked={field.value}
                      onCheckedChange={field.onChange}
                      data-testid="checkbox-default"
                    />
                  </FormControl>
                  <div className="space-y-1 leading-none">
                    <FormLabel>Set as default address</FormLabel>
                  </div>
                </FormItem>
              )}
            />

            <div className="flex justify-end gap-2 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                data-testid="button-cancel"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={updateMutation.isPending}
                data-testid="button-submit"
              >
                {updateMutation.isPending ? "Updating..." : "Update Address"}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
