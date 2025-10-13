import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { MapPin, Plus, Pencil, Trash2, Star } from "lucide-react";

const addressFormSchema = z.object({
  label: z.string().min(1, "Label is required"),
  addressStreet: z.string().min(1, "Street address is required"),
  addressCity: z.string().min(1, "City is required"),
  addressProvince: z.string().min(1, "Province is required"),
  addressPostalCode: z.string().min(1, "Postal code is required"),
  addressCountry: z.string().default("South Africa"),
  lat: z.string().min(1, "Latitude is required").refine((val) => !isNaN(Number(val)), {
    message: "Latitude must be a number",
  }),
  lng: z.string().min(1, "Longitude is required").refine((val) => !isNaN(Number(val)), {
    message: "Longitude must be a number",
  }),
  accessInstructions: z.string().optional(),
  isDefault: z.boolean().default(false),
});

type AddressFormValues = z.infer<typeof addressFormSchema>;

interface DeliveryAddressManagerProps {
  compact?: boolean;
}

export function DeliveryAddressManager({ compact = false }: DeliveryAddressManagerProps) {
  const [openCreate, setOpenCreate] = useState(false);
  const [editingAddress, setEditingAddress] = useState<any | null>(null);
  const { toast } = useToast();

  // Fetch delivery addresses
  const { data: addresses = [], isLoading } = useQuery<any[]>({
    queryKey: ["/api/customer/delivery-addresses"],
  });

  const form = useForm<AddressFormValues>({
    resolver: zodResolver(addressFormSchema),
    defaultValues: {
      label: "",
      addressStreet: "",
      addressCity: "",
      addressProvince: "",
      addressPostalCode: "",
      addressCountry: "South Africa",
      lat: "",
      lng: "",
      accessInstructions: "",
      isDefault: false,
    },
  });

  // Create address mutation
  const createAddressMutation = useMutation({
    mutationFn: async (values: AddressFormValues) => {
      const response = await apiRequest("POST", "/api/customer/delivery-addresses", {
        label: values.label,
        addressStreet: values.addressStreet,
        addressCity: values.addressCity,
        addressProvince: values.addressProvince,
        addressPostalCode: values.addressPostalCode,
        addressCountry: values.addressCountry,
        lat: parseFloat(values.lat),
        lng: parseFloat(values.lng),
        accessInstructions: values.accessInstructions || null,
        isDefault: values.isDefault,
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/customer/delivery-addresses"] });
      toast({
        title: "Address added",
        description: "Your delivery address has been saved",
      });
      form.reset();
      setOpenCreate(false);
      setEditingAddress(null);
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to add address",
        variant: "destructive",
      });
    },
  });

  // Update address mutation
  const updateAddressMutation = useMutation({
    mutationFn: async ({ id, values }: { id: string; values: AddressFormValues }) => {
      const response = await apiRequest("PATCH", `/api/customer/delivery-addresses/${id}`, {
        label: values.label,
        addressStreet: values.addressStreet,
        addressCity: values.addressCity,
        addressProvince: values.addressProvince,
        addressPostalCode: values.addressPostalCode,
        addressCountry: values.addressCountry,
        lat: parseFloat(values.lat),
        lng: parseFloat(values.lng),
        accessInstructions: values.accessInstructions || null,
        isDefault: values.isDefault,
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/customer/delivery-addresses"] });
      toast({
        title: "Address updated",
        description: "Your delivery address has been updated",
      });
      form.reset();
      setOpenCreate(false);
      setEditingAddress(null);
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update address",
        variant: "destructive",
      });
    },
  });

  // Delete address mutation
  const deleteAddressMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await apiRequest("DELETE", `/api/customer/delivery-addresses/${id}`);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/customer/delivery-addresses"] });
      toast({
        title: "Address deleted",
        description: "Your delivery address has been removed",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to delete address",
        variant: "destructive",
      });
    },
  });

  const handleEdit = (address: any) => {
    setEditingAddress(address);
    form.reset({
      label: address.label,
      addressStreet: address.address_street,
      addressCity: address.address_city,
      addressProvince: address.address_province,
      addressPostalCode: address.address_postal_code,
      addressCountry: address.address_country || "South Africa",
      lat: address.lat?.toString() || "",
      lng: address.lng?.toString() || "",
      accessInstructions: address.access_instructions || "",
      isDefault: address.is_default || false,
    });
    setOpenCreate(true);
  };

  const handleDelete = (id: string) => {
    if (confirm("Are you sure you want to delete this address?")) {
      deleteAddressMutation.mutate(id);
    }
  };

  const onSubmit = (values: AddressFormValues) => {
    if (editingAddress) {
      updateAddressMutation.mutate({ id: editingAddress.id, values });
    } else {
      createAddressMutation.mutate(values);
    }
  };

  if (isLoading) {
    return <div className="text-sm text-muted-foreground">Loading addresses...</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Delivery Addresses</h3>
          <p className="text-sm text-muted-foreground">
            Manage your saved delivery locations
          </p>
        </div>
        <Dialog open={openCreate} onOpenChange={(open) => {
          setOpenCreate(open);
          if (!open) {
            setEditingAddress(null);
            form.reset();
          }
        }}>
          <DialogTrigger asChild>
            <Button data-testid="button-add-address">
              <Plus className="h-4 w-4 mr-2" />
              Add Address
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>
                {editingAddress ? "Edit Address" : "Add New Address"}
              </DialogTitle>
              <DialogDescription>
                {editingAddress 
                  ? "Update your delivery address details" 
                  : "Add a new delivery address for future orders"}
              </DialogDescription>
            </DialogHeader>

            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <FormField
                  control={form.control}
                  name="label"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Address Label *</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="e.g. Home, Office, Warehouse 1"
                          {...field}
                          data-testid="input-address-label"
                        />
                      </FormControl>
                      <FormDescription>
                        A friendly name to identify this location
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="addressStreet"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Street Address *</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="e.g. 123 Main Street, Unit 4"
                          {...field}
                          data-testid="input-address-street"
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
                        <FormLabel>City *</FormLabel>
                        <FormControl>
                          <Input
                            placeholder="e.g. Johannesburg"
                            {...field}
                            data-testid="input-address-city"
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
                        <FormLabel>Province *</FormLabel>
                        <FormControl>
                          <Input
                            placeholder="e.g. Gauteng"
                            {...field}
                            data-testid="input-address-province"
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
                    name="addressPostalCode"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Postal Code *</FormLabel>
                        <FormControl>
                          <Input
                            placeholder="e.g. 2001"
                            {...field}
                            data-testid="input-address-postal-code"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="addressCountry"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Country *</FormLabel>
                        <FormControl>
                          <Input
                            {...field}
                            data-testid="input-address-country"
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
                        <FormLabel>Latitude *</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            step="any"
                            placeholder="e.g. -26.2041"
                            {...field}
                            data-testid="input-address-lat"
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
                        <FormLabel>Longitude *</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            step="any"
                            placeholder="e.g. 28.0473"
                            {...field}
                            data-testid="input-address-lng"
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
                      <FormLabel>Access Instructions</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="e.g. Gate code #1234, use side entrance"
                          {...field}
                          data-testid="input-address-access"
                        />
                      </FormControl>
                      <FormDescription>
                        Any special instructions for accessing this location
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="isDefault"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-md border p-4">
                      <FormControl>
                        <Checkbox
                          checked={field.value}
                          onCheckedChange={field.onChange}
                          data-testid="checkbox-default-address"
                        />
                      </FormControl>
                      <div className="space-y-1 leading-none">
                        <FormLabel>Set as default address</FormLabel>
                        <FormDescription>
                          Use this address by default for new orders
                        </FormDescription>
                      </div>
                    </FormItem>
                  )}
                />

                <div className="flex justify-end gap-3 pt-4">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setOpenCreate(false);
                      setEditingAddress(null);
                      form.reset();
                    }}
                    data-testid="button-cancel-address"
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    disabled={createAddressMutation.isPending || updateAddressMutation.isPending}
                    data-testid="button-save-address"
                  >
                    {createAddressMutation.isPending || updateAddressMutation.isPending
                      ? "Saving..."
                      : editingAddress
                      ? "Update Address"
                      : "Add Address"}
                  </Button>
                </div>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>

      {addresses.length === 0 ? (
        <Card>
          <CardContent className="pt-6 text-center">
            <MapPin className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
            <p className="text-sm text-muted-foreground mb-4">
              No delivery addresses saved yet. Add your first address to get started.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {addresses.map((address) => (
            <Card key={address.id} className="relative" data-testid={`card-address-${address.id}`}>
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <MapPin className="h-4 w-4 text-primary" />
                    <CardTitle className="text-base">{address.label}</CardTitle>
                    {address.is_default && (
                      <Badge variant="secondary" className="text-xs">
                        <Star className="h-3 w-3 mr-1" />
                        Default
                      </Badge>
                    )}
                  </div>
                  <div className="flex gap-1">
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => handleEdit(address)}
                      data-testid={`button-edit-address-${address.id}`}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => handleDelete(address.id)}
                      data-testid={`button-delete-address-${address.id}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-1 text-sm">
                  <p>{address.address_street}</p>
                  <p className="text-muted-foreground">
                    {address.address_city}, {address.address_province} {address.address_postal_code}
                  </p>
                  {address.access_instructions && (
                    <p className="text-xs text-muted-foreground mt-2">
                      Access: {address.access_instructions}
                    </p>
                  )}
                  <div className="flex items-center gap-2 mt-2 pt-2 border-t">
                    <Badge variant="outline" className="text-xs">
                      {address.verification_status}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      {address.lat?.toFixed(4)}, {address.lng?.toFixed(4)}
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
