import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, Package } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { formatCurrency } from "@/lib/utils";
import { useCurrency } from "@/hooks/use-currency";

interface DriverDepotOrdersViewProps {
  statusFilter?: string[] | null;
}

export function DriverDepotOrdersView({ statusFilter }: DriverDepotOrdersViewProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { currency } = useCurrency();

  const { data: orders, isLoading } = useQuery<any[]>({
    queryKey: ["/api/supplier/driver-depot-orders"],
    refetchInterval: 10000, // Refresh every 10 seconds
  });

  // Filter orders based on statusFilter
  const filteredOrders = statusFilter && statusFilter.length > 0
    ? (orders || []).filter((order: any) => statusFilter.includes(order.status))
    : orders || [];

  const updateOrderMutation = useMutation({
    mutationFn: async ({
      orderId,
      status,
    }: {
      orderId: string;
      status: string;
    }) => {
      return apiRequest("PATCH", `/api/supplier/driver-depot-orders/${orderId}`, {
        status,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["/api/supplier/driver-depot-orders"],
      });
      toast({
        title: "Order Updated",
        description: "Order status has been updated successfully.",
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

  const getStatusBadge = (status: string) => {
    const variants: Record<string, "default" | "secondary" | "destructive"> = {
      pending: "secondary",
      confirmed: "default",
      fulfilled: "default",
      cancelled: "destructive",
    };
    return (
      <Badge variant={variants[status] || "secondary"}>
        {status.charAt(0).toUpperCase() + status.slice(1)}
      </Badge>
    );
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!filteredOrders || filteredOrders.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <Package className="h-12 w-12 mx-auto mb-4 opacity-50" />
        <p>{statusFilter && statusFilter.length > 0 ? "No active orders" : "No driver orders yet"}</p>
        <p className="text-sm mt-2">
          {statusFilter && statusFilter.length > 0 
            ? "Orders with pending or confirmed status will appear here"
            : "Driver orders from your depots will appear here"}
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Order ID</TableHead>
            <TableHead>Driver</TableHead>
            <TableHead>Depot</TableHead>
            <TableHead>Fuel Type</TableHead>
            <TableHead>Litres</TableHead>
            <TableHead>Price</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Date</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {filteredOrders.map((order: any) => (
            <TableRow key={order.id}>
              <TableCell className="font-medium">
                #{order.id.slice(0, 8)}
              </TableCell>
              <TableCell>
                {order.drivers?.profile?.full_name || "Unknown Driver"}
              </TableCell>
              <TableCell>{order.depots?.name || "Unknown"}</TableCell>
              <TableCell>
                {order.fuel_types?.label || "Unknown"}
              </TableCell>
              <TableCell>{order.litres}L</TableCell>
              <TableCell>
                {formatCurrency(order.total_price_cents / 100, currency)}
              </TableCell>
              <TableCell>{getStatusBadge(order.status)}</TableCell>
              <TableCell>
                {new Date(order.created_at).toLocaleDateString()}
              </TableCell>
              <TableCell className="text-right">
                {order.status === "pending" && (
                  <div className="flex gap-2 justify-end">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        updateOrderMutation.mutate({
                          orderId: order.id,
                          status: "confirmed",
                        });
                      }}
                      disabled={updateOrderMutation.isPending}
                    >
                      Confirm
                    </Button>
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => {
                        if (
                          confirm(
                            "Are you sure you want to cancel this order?"
                          )
                        ) {
                          updateOrderMutation.mutate({
                            orderId: order.id,
                            status: "cancelled",
                          });
                        }
                      }}
                      disabled={updateOrderMutation.isPending}
                    >
                      Cancel
                    </Button>
                  </div>
                )}
                {order.status === "confirmed" && (
                  <Button
                    variant="default"
                    size="sm"
                    onClick={() => {
                      updateOrderMutation.mutate({
                        orderId: order.id,
                        status: "fulfilled",
                      });
                    }}
                    disabled={updateOrderMutation.isPending}
                  >
                    Mark Fulfilled
                  </Button>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

