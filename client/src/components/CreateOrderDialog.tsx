import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQuery } from "@tanstack/react-query";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Plus, MapPin, Truck, CreditCard, FileSignature } from "lucide-react";
import { AddAddressDialog } from "@/components/AddAddressDialog";
import { SignaturePad } from "@/components/SignaturePad";

const orderFormSchema = z.object({
  fuelTypeId: z.string().min(1, "Please select a fuel type"),
  litres: z.string().min(1, "Litres is required").refine((val) => !isNaN(Number(val)) && Number(val) > 0, {
    message: "Litres must be a positive number",
  }),
  maxBudget: z.string().optional().refine((val) => !val || (!isNaN(Number(val)) && Number(val) > 0), {
    message: "Budget must be a positive number",
  }),
  deliveryAddressId: z.string().min(1, "Please select a delivery address"),
  deliveryDate: z.string().optional(),
  fromTime: z.string().optional(),
  toTime: z.string().optional(),
  accessNotes: z.string().optional(),
  priorityLevel: z.enum(["low", "medium", "high"]).default("medium"),
  vehicleRegistration: z.string().optional(),
  equipmentType: z.string().optional(),
  tankCapacity: z.string().optional().refine((val) => !val || (!isNaN(Number(val)) && Number(val) > 0), {
    message: "Tank capacity must be a positive number",
  }),
  paymentMethodId: z.string().optional(),
  termsAccepted: z.boolean().refine((val) => val === true, {
    message: "You must accept the terms and conditions",
  }),
});

type OrderFormValues = z.infer<typeof orderFormSchema>;

interface CreateOrderDialogProps {
  trigger?: React.ReactNode;
}

export function CreateOrderDialog({ trigger }: CreateOrderDialogProps) {
  const [open, setOpen] = useState(false);
  const [signatureData, setSignatureData] = useState<string | null>(null);
  const [showAddAddressDialog, setShowAddAddressDialog] = useState(false);
  const { toast } = useToast();

  // Fetch fuel types
  const { data: fuelTypes = [], isLoading: loadingFuelTypes } = useQuery<any[]>({
    queryKey: ["/api/fuel-types"],
  });

  // Fetch delivery addresses
  const { data: deliveryAddresses = [], isLoading: loadingAddresses } = useQuery<any[]>({
    queryKey: ["/api/delivery-addresses"],
  });

  // Fetch payment methods
  const { data: paymentMethods = [], isLoading: loadingPaymentMethods } = useQuery<any[]>({
    queryKey: ["/api/payment-methods"],
  });

  const form = useForm<OrderFormValues>({
    resolver: zodResolver(orderFormSchema),
    defaultValues: {
      fuelTypeId: "",
      litres: "",
      maxBudget: "",
      deliveryAddressId: "",
      deliveryDate: "",
      fromTime: "",
      toTime: "",
      accessNotes: "",
      priorityLevel: "medium",
      vehicleRegistration: "",
      equipmentType: "",
      tankCapacity: "",
      paymentMethodId: "",
      termsAccepted: false,
    },
  });

  const createOrderMutation = useMutation({
    mutationFn: async (values: OrderFormValues) => {
      const response = await apiRequest("POST", "/api/orders", {
        fuelTypeId: values.fuelTypeId,
        litres: values.litres,
        maxBudgetCents: values.maxBudget ? Math.round(parseFloat(values.maxBudget) * 100) : null,
        deliveryAddressId: values.deliveryAddressId,
        deliveryDate: values.deliveryDate || null,
        fromTime: values.fromTime || null,
        toTime: values.toTime || null,
        accessNotes: values.accessNotes || null,
        priorityLevel: values.priorityLevel,
        vehicleRegistration: values.vehicleRegistration || null,
        equipmentType: values.equipmentType || null,
        tankCapacity: values.tankCapacity || null,
        paymentMethodId: values.paymentMethodId || null,
        termsAccepted: values.termsAccepted,
        signatureData: signatureData || null,
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
      queryClient.invalidateQueries({ queryKey: ["/api/driver/offers"] }); // Refresh driver offers
      toast({
        title: "Order created",
        description: "Your order has been placed successfully and is now available for drivers",
      });
      form.reset();
      setSignatureData(null);
      setOpen(false);
    },
    onError: (error: any) => {
      console.error("Order creation error:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to create order. Please check the console for details.",
        variant: "destructive",
      });
    },
  });

  const onSubmit = (values: OrderFormValues) => {
    console.log("Form submitted with values:", values);
    createOrderMutation.mutate(values);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger || (
          <Button data-testid="button-new-order">
            <Plus className="h-4 w-4 mr-2" />
            New Order
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-[700px] max-h-[90vh] overflow-y-auto" data-testid="dialog-create-order">
        <DialogHeader>
          <DialogTitle>Create New Order</DialogTitle>
          <DialogDescription>
            Place a new fuel delivery order. Fill in all required details below.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <Tabs defaultValue="fuel" className="w-full">
              <TabsList className="grid w-full grid-cols-4">
                <TabsTrigger value="fuel">Fuel</TabsTrigger>
                <TabsTrigger value="delivery">
                  <MapPin className="h-4 w-4 mr-1" />
                  Delivery
                </TabsTrigger>
                <TabsTrigger value="vehicle">
                  <Truck className="h-4 w-4 mr-1" />
                  Vehicle
                </TabsTrigger>
                <TabsTrigger value="payment">
                  <CreditCard className="h-4 w-4 mr-1" />
                  Payment
                </TabsTrigger>
              </TabsList>

              <TabsContent value="fuel" className="space-y-4 mt-4">
                <FormField
                  control={form.control}
                  name="fuelTypeId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Fuel Type *</FormLabel>
                      <Select
                        onValueChange={field.onChange}
                        defaultValue={field.value}
                        disabled={loadingFuelTypes}
                      >
                        <FormControl>
                          <SelectTrigger data-testid="select-fuel-type">
                            <SelectValue placeholder="Select fuel type" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {fuelTypes.map((fuelType) => (
                            <SelectItem
                              key={fuelType.id}
                              value={fuelType.id}
                              data-testid={`option-fuel-type-${fuelType.code}`}
                            >
                              {fuelType.label}
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
                  name="litres"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Litres *</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          placeholder="e.g. 500"
                          {...field}
                          data-testid="input-litres"
                        />
                      </FormControl>
                      <FormDescription>Enter the amount of fuel in litres</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="maxBudget"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Maximum Budget (optional)</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          step="0.01"
                          placeholder="e.g. 500.00"
                          {...field}
                          data-testid="input-max-budget"
                        />
                      </FormControl>
                      <FormDescription>Set your maximum budget to filter driver offers</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="priorityLevel"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Priority Level</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger data-testid="select-priority">
                            <SelectValue placeholder="Select priority" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="low">Low</SelectItem>
                          <SelectItem value="medium">Medium</SelectItem>
                          <SelectItem value="high">High</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </TabsContent>

              <TabsContent value="delivery" className="space-y-4 mt-4">
                <FormField
                  control={form.control}
                  name="deliveryAddressId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Delivery Address *</FormLabel>
                      <Select
                        onValueChange={field.onChange}
                        value={field.value}
                        disabled={loadingAddresses}
                      >
                        <FormControl>
                          <SelectTrigger data-testid="select-delivery-address">
                            <SelectValue placeholder="Select delivery address" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {deliveryAddresses.length === 0 ? (
                            <div className="p-2 text-sm text-muted-foreground">
                              No addresses saved. Add one using the button below.
                            </div>
                          ) : (
                            deliveryAddresses.map((address) => (
                              <SelectItem
                                key={address.id}
                                value={address.id}
                                data-testid={`option-address-${address.id}`}
                              >
                                {address.label} - {address.address_city}
                              </SelectItem>
                            ))
                          )}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="mt-2 w-full"
                        onClick={() => setShowAddAddressDialog(true)}
                        data-testid="button-add-address-inline"
                      >
                        <Plus className="h-4 w-4 mr-2" />
                        Add New Address
                      </Button>
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="deliveryDate"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Delivery Date</FormLabel>
                      <FormControl>
                        <Input
                          type="date"
                          {...field}
                          data-testid="input-delivery-date"
                        />
                      </FormControl>
                      <FormDescription>
                        Select your preferred delivery date
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="fromTime"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>From Time</FormLabel>
                        <FormControl>
                          <Input
                            type="time"
                            {...field}
                            data-testid="input-from-time"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="toTime"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>To Time</FormLabel>
                        <FormControl>
                          <Input
                            type="time"
                            {...field}
                            data-testid="input-to-time"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={form.control}
                  name="accessNotes"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Access Notes</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="e.g. Gate code, parking instructions, contact person"
                          {...field}
                          data-testid="input-access-notes"
                        />
                      </FormControl>
                      <FormDescription>
                        Provide any special instructions for the driver to access your location
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </TabsContent>

              <TabsContent value="vehicle" className="space-y-4 mt-4">
                <FormField
                  control={form.control}
                  name="vehicleRegistration"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Vehicle Registration</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="e.g. ABC 123 GP"
                          {...field}
                          data-testid="input-vehicle-registration"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="equipmentType"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Equipment Type</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger data-testid="select-equipment-type">
                            <SelectValue placeholder="Select equipment type" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="generator">Generator</SelectItem>
                          <SelectItem value="vehicle">Vehicle</SelectItem>
                          <SelectItem value="machinery">Machinery</SelectItem>
                          <SelectItem value="storage_tank">Storage Tank</SelectItem>
                          <SelectItem value="other">Other</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="tankCapacity"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Tank Capacity (Litres)</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          placeholder="e.g. 1000"
                          {...field}
                          data-testid="input-tank-capacity"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </TabsContent>

              <TabsContent value="payment" className="space-y-4 mt-4">
                <FormField
                  control={form.control}
                  name="paymentMethodId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Payment Method</FormLabel>
                      <Select
                        onValueChange={field.onChange}
                        defaultValue={field.value}
                        disabled={loadingPaymentMethods}
                      >
                        <FormControl>
                          <SelectTrigger data-testid="select-payment-method">
                            <SelectValue placeholder="Select payment method" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {paymentMethods.length === 0 ? (
                            <div className="p-2 text-sm text-muted-foreground">
                              No payment methods saved. Add one in your profile settings.
                            </div>
                          ) : (
                            paymentMethods.map((method) => (
                              <SelectItem
                                key={method.id}
                                value={method.id}
                                data-testid={`option-payment-${method.id}`}
                              >
                                {method.label} ({method.method_type})
                              </SelectItem>
                            ))
                          )}
                        </SelectContent>
                      </Select>
                      <FormDescription>
                        Optional: Select saved payment method or pay later
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <Separator className="my-4" />

                <div className="space-y-4">
                  <div>
                    <FormLabel className="flex items-center gap-2 mb-2">
                      <FileSignature className="h-4 w-4" />
                      Electronic Signature
                    </FormLabel>
                    <SignaturePad
                      value={signatureData}
                      onChange={setSignatureData}
                      className="border rounded-md p-2 bg-background"
                      canvasProps={{ "data-testid": "canvas-signature" }}
                    />
                    <p className="text-sm text-muted-foreground mt-1">
                      Sign above to acknowledge the order details
                    </p>
                  </div>

                  <FormField
                    control={form.control}
                    name="termsAccepted"
                    render={({ field }) => (
                      <FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-md border p-4">
                        <FormControl>
                          <Checkbox
                            checked={field.value}
                            onCheckedChange={field.onChange}
                            data-testid="checkbox-terms"
                          />
                        </FormControl>
                        <div className="space-y-1 leading-none">
                          <FormLabel>
                            Accept Terms and Conditions *
                          </FormLabel>
                          <FormDescription>
                            I agree to the terms and conditions of service and confirm the order
                            details are correct.
                          </FormDescription>
                          <FormMessage />
                        </div>
                      </FormItem>
                    )}
                  />
                </div>
              </TabsContent>
            </Tabs>

            <div className="flex justify-end gap-3 pt-4 border-t">
              <Button
                type="button"
                variant="outline"
                onClick={() => setOpen(false)}
                data-testid="button-cancel-order"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={createOrderMutation.isPending}
                data-testid="button-submit-order"
              >
                {createOrderMutation.isPending ? "Creating..." : "Create Order"}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>

      <AddAddressDialog
        open={showAddAddressDialog}
        onOpenChange={setShowAddAddressDialog}
        onSuccess={(createdAddress) => {
          // Auto-select the newly created address
          if (createdAddress?.id) {
            form.setValue("deliveryAddressId", createdAddress.id);
          }
        }}
      />
    </Dialog>
  );
}
