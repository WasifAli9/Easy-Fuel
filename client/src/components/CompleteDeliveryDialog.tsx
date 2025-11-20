import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SignaturePad } from "@/components/SignaturePad";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useMutation } from "@tanstack/react-query";

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
  const [signatureData, setSignatureData] = useState<string | null>(null);
  const [signatureName, setSignatureName] = useState("");
  const { toast } = useToast();

  useEffect(() => {
    if (open) {
      setSignatureData(null);
      setSignatureName("");
    }
  }, [open, order?.id]);

  const completeDeliveryMutation = useMutation({
    mutationFn: async () => {
      if (!order) {
        throw new Error("Order not provided");
      }

      if (!signatureData) {
        throw new Error("Customer signature is required to complete delivery");
      }

      const payload = {
        signatureData,
        signatureName: signatureName || undefined,
      };

      const response = await apiRequest(
        "POST",
        `/api/driver/orders/${order.id}/complete`,
        payload
      );

      return response.json();
    },
    onSuccess: async () => {
      const orderId = order.id;
      // Invalidate all related queries
      await queryClient.invalidateQueries({ queryKey: ["/api/driver/assigned-orders"] });
      await queryClient.invalidateQueries({ queryKey: ["/api/driver/stats"] });
      await queryClient.invalidateQueries({ queryKey: ["/api/driver/profile"] });
      await queryClient.invalidateQueries({ queryKey: ["/api/driver/completed-orders"] });
      await queryClient.invalidateQueries({ queryKey: ["/api/orders", orderId] });
      await queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
      await queryClient.invalidateQueries({ queryKey: ["/api/orders", orderId, "offers"] });
      // Immediately refetch to show updated state
      await queryClient.refetchQueries({ queryKey: ["/api/driver/assigned-orders"] });
      await queryClient.refetchQueries({ queryKey: ["/api/orders", orderId] });
      await queryClient.refetchQueries({ queryKey: ["/api/orders"] });
      toast({
        title: "Delivery completed",
        description: "The order has been marked as delivered successfully.",
      });
      onOpenChange(false);
    },
    onError: (error: any) => {
      toast({
        title: "Error",
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
    "Customer";

  const deliveryAddress =
    order.delivery_addresses?.address_street ||
    `${order.drop_lat}, ${order.drop_lng}`;

  const litresDisplay = order.litres ? Number(order.litres).toLocaleString() : "0";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Complete Delivery</DialogTitle>
          <DialogDescription>
            Capture the customer’s signature to confirm delivery completion.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="rounded-md border bg-muted/40 p-4 text-sm space-y-2">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Order</span>
              <span className="font-medium">
                {order.id.substring(0, 8).toUpperCase()}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Customer</span>
              <span className="font-medium">{customerName}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Fuel</span>
              <span className="font-medium">
                {order.fuel_types?.label || "Fuel"} · {litresDisplay} L
              </span>
            </div>
            <div>
              <span className="text-muted-foreground block">Delivery Address</span>
              <span className="font-medium text-xs break-words">
                {deliveryAddress}
              </span>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="signature-name">
              Signer Name <span className="text-muted-foreground">(optional)</span>
            </Label>
            <Input
              id="signature-name"
              placeholder="Customer full name"
              value={signatureName}
              onChange={(event) => setSignatureName(event.target.value)}
              disabled={completeDeliveryMutation.isPending}
            />
          </div>

          <div className="space-y-2">
            <Label>Customer Signature *</Label>
            <SignaturePad
              value={signatureData}
              onChange={setSignatureData}
              canvasProps={{ "data-testid": "canvas-delivery-signature" }}
              disabled={completeDeliveryMutation.isPending}
            />
            <p className="text-xs text-muted-foreground">
              Ask the customer to sign above to confirm fuel delivery.
            </p>
          </div>

          <div className="flex justify-end gap-2 pt-2">
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
              disabled={completeDeliveryMutation.isPending || !signatureData}
            >
              {completeDeliveryMutation.isPending ? "Saving..." : "Confirm Delivery"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

