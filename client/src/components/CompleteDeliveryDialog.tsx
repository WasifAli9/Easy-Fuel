import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useMutation } from "@tanstack/react-query";
import { CreditCard, Loader2 } from "lucide-react";

interface CompleteDeliveryDialogProps {
  order: any | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CompleteDeliveryDialog({
  order,
  open,
  onOpenChange,
}: CompleteDeliveryDialogProps) {
  const { toast } = useToast();

  const completeDeliveryMutation = useMutation({
    mutationFn: async () => {
      if (!order) {
        throw new Error("Order not provided");
      }

      const response = await apiRequest("POST", `/api/driver/orders/${order.id}/complete`, {});
      return response.json();
    },
    onSuccess: async () => {
      const orderId = order.id;
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["/api/driver/assigned-orders"] }),
        queryClient.invalidateQueries({ queryKey: ["/api/driver/completed-orders"] }),
        queryClient.invalidateQueries({ queryKey: ["/api/driver/stats"] }),
        queryClient.invalidateQueries({ queryKey: ["/api/orders", orderId] }),
      ]);

      toast({
        title: "Awaiting customer payment",
        description: "The customer has been notified to pay. This job will leave your active list.",
      });
      onOpenChange(false);
    },
    onError: (error: any) => {
      toast({
        title: "Could not complete delivery",
        description: error.message || "Failed to complete delivery.",
        variant: "destructive",
      });
    },
  });

  if (!order) {
    return null;
  }

  const customerName =
    order.customers?.profiles?.full_name ||
    order.customers?.company_name ||
    order.customer_name ||
    "Customer";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md" data-testid="dialog-complete-delivery">
        <DialogHeader>
          <DialogTitle>Complete delivery?</DialogTitle>
          <DialogDescription>
            Confirm that fuel was delivered. The customer will be asked to pay online before the order is
            finalised.
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-lg border bg-muted/40 p-3 text-sm space-y-1">
          <p>
            <span className="text-muted-foreground">Order:</span> {order.id?.slice(0, 8).toUpperCase()}
          </p>
          <p>
            <span className="text-muted-foreground">Customer:</span> {customerName}
          </p>
          <p>
            <span className="text-muted-foreground">Fuel:</span>{" "}
            {order.fuel_types?.label || "Fuel"} · {order.litres} L
          </p>
        </div>

        <div className="flex items-start gap-3 rounded-lg border border-primary/25 bg-primary/5 p-3 text-sm">
          <CreditCard className="h-5 w-5 text-primary shrink-0 mt-0.5" />
          <p className="text-muted-foreground">
            Status will change to <strong className="text-foreground">Awaiting Payment</strong>. The customer
            receives a notification to pay with Ozow. Once paid, the order is marked delivered and removed
            from My Jobs.
          </p>
        </div>

        <div className="flex justify-end gap-3 pt-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={completeDeliveryMutation.isPending}
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={() => completeDeliveryMutation.mutate()}
            disabled={completeDeliveryMutation.isPending}
            className="bg-green-600 hover:bg-green-700"
            data-testid="button-confirm-complete-delivery"
          >
            {completeDeliveryMutation.isPending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                Completing…
              </>
            ) : (
              "Confirm & request payment"
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
