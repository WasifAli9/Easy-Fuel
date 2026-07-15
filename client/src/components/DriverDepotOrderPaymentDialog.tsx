import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Loader2, CreditCard } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { formatCurrency } from "@/lib/utils";
import { useCurrency } from "@/hooks/use-currency";

interface DriverDepotOrderPaymentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  order: any;
}

export function DriverDepotOrderPaymentDialog({
  open,
  onOpenChange,
  order,
}: DriverDepotOrderPaymentDialogProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { currency } = useCurrency();

  const payMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/driver/depot-orders/${order.id}/payment`, {});
      return res.json() as Promise<{ paymentUrl: string; paymentTransactionId: string }>;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/driver/depot-orders"] });
      onOpenChange(false);
      if (data.paymentUrl) {
        window.location.href = data.paymentUrl;
      } else {
        toast({
          title: "Payment started",
          description: "Complete payment on the Ozow checkout page.",
        });
      }
    },
    onError: (error: Error) => {
      toast({
        title: "Payment failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const totalCents =
    order?.total_price_cents ?? order?.totalPriceCents ?? 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Pay with Ozow</DialogTitle>
          <DialogDescription>
            Pay securely by card, instant EFT, Capitec Pay, ABSA Pay, or other Ozow methods.
            Platform fee is deducted automatically; the supplier receives the net amount.
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-lg border bg-muted/30 p-4 space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Depot</span>
            <span className="font-medium">{order?.depots?.name || "Depot"}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Litres</span>
            <span>{order?.litres ?? "-"} L</span>
          </div>
          <div className="flex justify-between font-semibold pt-2 border-t">
            <span>Total</span>
            <span className="text-primary">{formatCurrency(totalCents / 100, currency)}</span>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={() => payMutation.mutate()}
            disabled={payMutation.isPending}
            className="gap-2"
          >
            {payMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <CreditCard className="h-4 w-4" />
            )}
            Pay with Ozow
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
