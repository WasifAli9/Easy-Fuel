import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
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
      is_active: depot?.is_active ?? true,
      notes: depot?.notes || "",
    },
  });

  const createDepotMutation = useMutation({
    mutationFn: async (data: DepotFormData) => {
      const payload = {
        ...data,
        open_hours: data.open_hours ? JSON.parse(data.open_hours) : {},
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
      form.reset();
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
      const payload = {
        ...data,
        open_hours: data.open_hours ? JSON.parse(data.open_hours) : {},
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
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="open_hours"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Operating Hours (JSON format)</FormLabel>
                  <FormControl>
                    <Input
                      data-testid="input-depot-hours"
                      placeholder='{"monday": "6AM-6PM", "tuesday": "6AM-6PM"}'
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
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

            <FormField
              control={form.control}
              name="is_active"
              render={({ field }) => (
                <FormItem className="flex items-center justify-between rounded-lg border p-4">
                  <div className="space-y-0.5">
                    <FormLabel className="text-base">Active Status</FormLabel>
                    <div className="text-sm text-muted-foreground">
                      Depot is available for accepting orders
                    </div>
                  </div>
                  <FormControl>
                    <Switch
                      data-testid="switch-depot-active"
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    />
                  </FormControl>
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
