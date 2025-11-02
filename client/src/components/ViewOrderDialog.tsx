import { useState, useEffect } from "react";
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
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { MapPin, Calendar, DollarSign, Package, User, Phone, Clock } from "lucide-react";
import { StatusBadge } from "./StatusBadge";
import { Badge } from "@/components/ui/badge";
import { DriverLocationMap } from "./DriverLocationMap";

const orderEditSchema = z.object({
  fuelTypeId: z.string().min(1, "Please select a fuel type"),
  litres: z.string().min(1, "Litres is required").refine((val) => !isNaN(Number(val)) && Number(val) > 0, {
    message: "Litres must be a positive number",
  }),
  dropLat: z.string().min(1, "Latitude is required").refine((val) => !isNaN(Number(val)), {
    message: "Latitude must be a number",
  }),
  dropLng: z.string().min(1, "Longitude is required").refine((val) => !isNaN(Number(val)), {
    message: "Longitude must be a number",
  }),
  timeWindow: z.string().optional(),
});

type OrderEditValues = z.infer<typeof orderEditSchema>;

interface ViewOrderDialogProps {
  orderId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ViewOrderDialog({ orderId, open, onOpenChange }: ViewOrderDialogProps) {
  const [isEditing, setIsEditing] = useState(false);
  const { toast } = useToast();

  // Fetch order details
  const { data: order, isLoading: loadingOrder } = useQuery<any>({
    queryKey: ["/api/orders", orderId],
    enabled: open && !!orderId,
  });

  // Fetch fuel types for editing
  const { data: fuelTypes = [], isLoading: loadingFuelTypes } = useQuery<any[]>({
    queryKey: ["/api/fuel-types"],
    enabled: isEditing,
  });

  const form = useForm<OrderEditValues>({
    resolver: zodResolver(orderEditSchema),
    defaultValues: {
      fuelTypeId: "",
      litres: "",
      dropLat: "",
      dropLng: "",
      timeWindow: "",
    },
  });

  // Update form when order data changes
  useEffect(() => {
    if (order) {
      form.reset({
        fuelTypeId: order.fuel_type_id || "",
        litres: order.litres || "",
        dropLat: order.drop_lat?.toString() || "",
        dropLng: order.drop_lng?.toString() || "",
        timeWindow: order.time_window || "",
      });
    }
  }, [order, form]);

  const updateOrderMutation = useMutation({
    mutationFn: async (values: OrderEditValues) => {
      const response = await apiRequest("PATCH", `/api/orders/${orderId}`, {
        fuelTypeId: values.fuelTypeId,
        litres: values.litres,
        dropLat: parseFloat(values.dropLat),
        dropLng: parseFloat(values.dropLng),
        timeWindow: values.timeWindow || null,
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
      queryClient.invalidateQueries({ queryKey: ["/api/orders", orderId] });
      toast({
        title: "Order updated",
        description: "Your order has been updated successfully",
      });
      setIsEditing(false);
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update order",
        variant: "destructive",
      });
    },
  });

  const cancelOrderMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("DELETE", `/api/orders/${orderId}`);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
      toast({
        title: "Order cancelled",
        description: "Your order has been cancelled successfully",
      });
      onOpenChange(false);
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to cancel order",
        variant: "destructive",
      });
    },
  });

  const onSubmit = (values: OrderEditValues) => {
    updateOrderMutation.mutate(values);
  };

  const handleCancel = () => {
    if (confirm("Are you sure you want to cancel this order?")) {
      cancelOrderMutation.mutate();
    }
  };

  if (loadingOrder) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent data-testid="dialog-view-order">
          <div className="flex items-center justify-center py-8">
            <p className="text-muted-foreground">Loading order details...</p>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  if (!order) {
    return null;
  }

  const canEdit = ["created", "awaiting_payment"].includes(order.state);
  const canCancel = !["delivered", "cancelled", "picked_up", "en_route"].includes(order.state);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px]" data-testid="dialog-view-order">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <DialogTitle>Order Details</DialogTitle>
            <StatusBadge status={order.state} />
          </div>
          <DialogDescription>
            Order ID: {order.id}
          </DialogDescription>
        </DialogHeader>

        {!isEditing ? (
          <div className="space-y-4">
            {/* Order Summary */}
            <div className="space-y-3">
              <div className="flex items-center gap-3 p-3 bg-muted rounded-lg">
                <Package className="h-5 w-5 text-muted-foreground" />
                <div>
                  <p className="font-semibold" data-testid="text-fuel-type">
                    {order.fuel_types?.label || "Unknown"}
                  </p>
                  <p className="text-sm text-muted-foreground" data-testid="text-litres">
                    {order.litres}L
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3 p-3 bg-muted rounded-lg">
                <MapPin className="h-5 w-5 mt-0.5 text-muted-foreground" />
                <div className="flex-1">
                  <p className="text-sm font-medium">Delivery Location</p>
                  <p className="text-sm text-muted-foreground" data-testid="text-coordinates">
                    {order.drop_lat}, {order.drop_lng}
                  </p>
                </div>
              </div>

              {order.time_window && (
                <div className="flex items-center gap-3 p-3 bg-muted rounded-lg">
                  <Calendar className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <p className="text-sm font-medium">Time Window</p>
                    <p className="text-sm text-muted-foreground">{order.time_window}</p>
                  </div>
                </div>
              )}

              {/* Driver Information - Show when driver is assigned */}
              {order.assigned_driver_id && order.driver_details && (
                <div className="border-2 border-primary/20 rounded-lg p-4 space-y-3 bg-primary/5">
                  <div className="flex items-center gap-2 mb-2">
                    <Badge variant="default" className="bg-primary">
                      Driver Assigned
                    </Badge>
                  </div>
                  
                  <div className="space-y-2">
                    <div className="flex items-center gap-3">
                      <User className="h-4 w-4 text-muted-foreground" />
                      <div>
                        <p className="text-sm font-medium">Driver Name</p>
                        <p className="text-sm" data-testid="text-driver-name">
                          {order.driver_details.full_name || "Driver"}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <Phone className="h-4 w-4 text-muted-foreground" />
                      <div>
                        <p className="text-sm font-medium">Driver Phone</p>
                        <p className="text-sm" data-testid="text-driver-phone">
                          <a 
                            href={`tel:${order.driver_details.phone}`}
                            className="text-primary hover:underline"
                          >
                            {order.driver_details.phone || "Not available"}
                          </a>
                        </p>
                      </div>
                    </div>

                    {order.confirmed_delivery_time && (
                      <div className="flex items-center gap-3">
                        <Clock className="h-4 w-4 text-muted-foreground" />
                        <div>
                          <p className="text-sm font-medium">Confirmed Delivery Time</p>
                          <p className="text-sm" data-testid="text-confirmed-delivery-time">
                            {new Date(order.confirmed_delivery_time).toLocaleString("en-ZA", {
                              dateStyle: "medium",
                              timeStyle: "short",
                              timeZone: "Africa/Johannesburg",
                            })}
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Live GPS Tracking Map - Show when driver is assigned */}
              {order.assigned_driver_id && (
                <DriverLocationMap
                  orderId={order.id}
                  deliveryLat={order.drop_lat}
                  deliveryLng={order.drop_lng}
                />
              )}

              {/* Pricing Breakdown */}
              <div className="border-t pt-3 space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Fuel Cost</span>
                  <span data-testid="text-fuel-cost">R {(order.fuel_price_cents / 100).toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Delivery Fee</span>
                  <span data-testid="text-delivery-fee">R {(order.delivery_fee_cents / 100).toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Service Fee</span>
                  <span data-testid="text-service-fee">R {(order.service_fee_cents / 100).toFixed(2)}</span>
                </div>
                <div className="flex justify-between font-semibold pt-2 border-t">
                  <span>Total</span>
                  <span className="text-primary" data-testid="text-total">
                    R {(order.total_cents / 100).toFixed(2)}
                  </span>
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="flex justify-end gap-3 pt-4">
              {canCancel && (
                <Button
                  variant="destructive"
                  onClick={handleCancel}
                  disabled={cancelOrderMutation.isPending}
                  data-testid="button-cancel-order"
                >
                  {cancelOrderMutation.isPending ? "Cancelling..." : "Cancel Order"}
                </Button>
              )}
              {canEdit && (
                <Button
                  onClick={() => setIsEditing(true)}
                  data-testid="button-edit-order"
                >
                  Edit Order
                </Button>
              )}
            </div>
          </div>
        ) : (
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="fuelTypeId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Fuel Type</FormLabel>
                    <Select
                      onValueChange={field.onChange}
                      defaultValue={field.value}
                      disabled={loadingFuelTypes}
                    >
                      <FormControl>
                        <SelectTrigger data-testid="select-edit-fuel-type">
                          <SelectValue placeholder="Select fuel type" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {fuelTypes.map((fuelType) => (
                          <SelectItem
                            key={fuelType.id}
                            value={fuelType.id}
                            data-testid={`option-edit-fuel-type-${fuelType.code}`}
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
                    <FormLabel>Litres</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        placeholder="e.g. 500"
                        {...field}
                        data-testid="input-edit-litres"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="dropLat"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Latitude</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          step="any"
                          placeholder="e.g. -26.2041"
                          {...field}
                          data-testid="input-edit-latitude"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="dropLng"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Longitude</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          step="any"
                          placeholder="e.g. 28.0473"
                          {...field}
                          data-testid="input-edit-longitude"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="timeWindow"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Time Window (Optional)</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="e.g. 9:00 AM - 5:00 PM"
                        {...field}
                        data-testid="input-edit-time-window"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="flex justify-end gap-3 pt-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsEditing(false)}
                  data-testid="button-cancel-edit"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={updateOrderMutation.isPending}
                  data-testid="button-save-order"
                >
                  {updateOrderMutation.isPending ? "Saving..." : "Save Changes"}
                </Button>
              </div>
            </form>
          </Form>
        )}
      </DialogContent>
    </Dialog>
  );
}
