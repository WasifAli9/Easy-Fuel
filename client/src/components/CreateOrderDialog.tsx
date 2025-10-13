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
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Plus } from "lucide-react";

const orderFormSchema = z.object({
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

type OrderFormValues = z.infer<typeof orderFormSchema>;

interface CreateOrderDialogProps {
  trigger?: React.ReactNode;
}

export function CreateOrderDialog({ trigger }: CreateOrderDialogProps) {
  const [open, setOpen] = useState(false);
  const { toast } = useToast();

  // Fetch fuel types
  const { data: fuelTypes = [], isLoading: loadingFuelTypes } = useQuery<any[]>({
    queryKey: ["/api/fuel-types"],
  });

  const form = useForm<OrderFormValues>({
    resolver: zodResolver(orderFormSchema),
    defaultValues: {
      fuelTypeId: "",
      litres: "",
      dropLat: "",
      dropLng: "",
      timeWindow: "",
    },
  });

  const createOrderMutation = useMutation({
    mutationFn: async (values: OrderFormValues) => {
      return await apiRequest("/api/orders", {
        method: "POST",
        body: JSON.stringify({
          fuelTypeId: values.fuelTypeId,
          litres: values.litres,
          dropLat: parseFloat(values.dropLat),
          dropLng: parseFloat(values.dropLng),
          timeWindow: values.timeWindow || null,
        }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
      toast({
        title: "Order created",
        description: "Your order has been placed successfully",
      });
      form.reset();
      setOpen(false);
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to create order",
        variant: "destructive",
      });
    },
  });

  const onSubmit = (values: OrderFormValues) => {
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
      <DialogContent className="sm:max-w-[500px]" data-testid="dialog-create-order">
        <DialogHeader>
          <DialogTitle>Create New Order</DialogTitle>
          <DialogDescription>
            Place a new fuel delivery order. Fill in the details below.
          </DialogDescription>
        </DialogHeader>

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
                  <FormLabel>Litres</FormLabel>
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
                        data-testid="input-latitude"
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
              name="timeWindow"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Time Window (Optional)</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="e.g. 9:00 AM - 5:00 PM"
                      {...field}
                      data-testid="input-time-window"
                    />
                  </FormControl>
                  <FormDescription>Preferred delivery time window</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="flex justify-end gap-3 pt-4">
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
    </Dialog>
  );
}
