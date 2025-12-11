import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { MapPin, Package, Loader2, ShoppingCart, XCircle, CreditCard, FileSignature, CheckCircle, Receipt } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { formatCurrency } from "@/lib/utils";
import { useCurrency } from "@/hooks/use-currency";
import { DriverDepotOrderPaymentDialog } from "@/components/DriverDepotOrderPaymentDialog";
import { SignaturePad } from "@/components/SignaturePad";
import { DriverDepotOrderReceipt } from "@/components/DriverDepotOrderReceipt";

interface DriverDepotsViewProps {
  defaultTab?: "orders" | "depots";
}

export function DriverDepotsView({ defaultTab = "orders" }: DriverDepotsViewProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { currency } = useCurrency();
  const [selectedDepot, setSelectedDepot] = useState<any>(null);
  const [orderDialogOpen, setOrderDialogOpen] = useState(false);
  const [litres, setLitres] = useState("");
  const [selectedFuelType, setSelectedFuelType] = useState<string | null>(null);
  const [pickupDate, setPickupDate] = useState("");
  const [notes, setNotes] = useState("");
  const [paymentDialogOpen, setPaymentDialogOpen] = useState(false);
  const [selectedOrderForPayment, setSelectedOrderForPayment] = useState<any>(null);
  const [signatureDialogOpen, setSignatureDialogOpen] = useState(false);
  const [selectedOrderForSignature, setSelectedOrderForSignature] = useState<any>(null);
  const [signatureType, setSignatureType] = useState<"driver" | "delivery" | null>(null);
  const [signatureData, setSignatureData] = useState<string | null>(null);
  const [receiptDialogOpen, setReceiptDialogOpen] = useState(false);
  const [receiptViewDialogOpen, setReceiptViewDialogOpen] = useState(false);
  const [selectedOrderForReceipt, setSelectedOrderForReceipt] = useState<any>(null);

  // Fetch all depots with distance
  const { data: depots, isLoading: depotsLoading, error: depotsError } = useQuery<any[]>({
    queryKey: ["/api/driver/depots"],
    refetchInterval: 30000, // Refresh every 30 seconds
    retry: (failureCount, error: any) => {
      // Don't retry on 403 errors (compliance not approved)
      if (error?.status === 403 || error?.response?.status === 403) {
        return false;
      }
      return failureCount < 2;
    },
    retryDelay: 1000,
    // Return empty array on error instead of throwing
    select: (data) => data || [],
  });

  // Fetch driver's depot orders
  const { data: allOrders, isLoading: ordersLoading, error: ordersError } = useQuery<any[]>({
    queryKey: ["/api/driver/depot-orders"],
    refetchInterval: 10000, // Refresh every 10 seconds
    retry: (failureCount, error: any) => {
      // Don't retry on 403 errors (compliance not approved)
      if (error?.status === 403 || error?.response?.status === 403) {
        return false;
      }
      return failureCount < 2;
    },
    retryDelay: 1000,
    // Return empty array on error instead of throwing
    select: (data) => data || [],
  });

  // Filter orders to show all non-completed orders and completed orders from the last week
  const oneWeekAgo = new Date();
  oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
  
  const orders = (allOrders || []).filter((order: any) => {
    // Show all non-completed orders
    if (order.status !== "completed") {
      return true;
    }
    // For completed orders, only show those from the last week
    const orderDate = new Date(order.completed_at || order.updated_at || order.created_at);
    return orderDate >= oneWeekAgo;
  });

  // Create order mutation
  const createOrderMutation = useMutation({
    mutationFn: async (data: {
      depotId: string;
      fuelTypeId: string;
      litres: number;
      pickupDate?: string;
      notes?: string;
    }) => {
      return apiRequest("POST", "/api/driver/depot-orders", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/driver/depot-orders"] });
      setOrderDialogOpen(false);
      setSelectedDepot(null);
      setLitres("");
      setSelectedFuelType(null);
      setPickupDate("");
      setNotes("");
      toast({
        title: "Order Placed",
        description: "Your fuel order has been placed successfully.",
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

  // Cancel order mutation
  const cancelOrderMutation = useMutation({
    mutationFn: async (orderId: string) => {
      return apiRequest("POST", `/api/driver/depot-orders/${orderId}/cancel`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/driver/depot-orders"] });
      queryClient.invalidateQueries({ queryKey: ["/api/driver/depots"] });
      toast({
        title: "Order Cancelled",
        description: "Your order has been cancelled.",
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

  // Submit signature mutation
  const submitSignatureMutation = useMutation({
    mutationFn: async ({ orderId, signatureUrl, type }: { orderId: string; signatureUrl: string; type: "driver" | "delivery" }) => {
      // For delivery signature (after release), use driver-signature endpoint which will detect awaiting_signature status
      const response = await apiRequest("POST", `/api/driver/depot-orders/${orderId}/driver-signature`, { signatureUrl });
      const updatedOrder = await response.json();
      return updatedOrder;
    },
    onSuccess: async (updatedOrder) => {
      // Update the cache optimistically with the returned order
      queryClient.setQueryData<any[]>(["/api/driver/depot-orders"], (oldData) => {
        if (!oldData) return oldData;
        return oldData.map((order: any) => 
          order.id === updatedOrder.id ? updatedOrder : order
        );
      });
      
      // Also invalidate and refetch to ensure we have the latest data
      await queryClient.invalidateQueries({ queryKey: ["/api/driver/depot-orders"] });
      await queryClient.refetchQueries({ queryKey: ["/api/driver/depot-orders"] });
      
      toast({
        title: "Receipt Confirmed",
        description: "Your signature has been submitted. Order completed!",
      });
      setSignatureDialogOpen(false);
      setSelectedOrderForSignature(null);
      setSignatureData(null);
      setSignatureType(null);
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleSubmitSignature = async () => {
    if (!signatureData || !selectedOrderForSignature || !signatureType) {
      toast({
        title: "Validation Error",
        description: "Please provide a signature",
        variant: "destructive",
      });
      return;
    }

    // Convert data URL to blob and upload
    try {
      const response = await fetch(signatureData);
      const blob = await response.blob();
      const file = new File([blob], "signature.png", { type: "image/png" });

      const { getAuthHeaders } = await import("@/lib/auth-headers");
      const headers = await getAuthHeaders();
      
      // Get upload URL using the correct endpoint
      const uploadUrlResponse = await fetch("/api/objects/upload", {
        method: "POST",
        headers,
      });

      if (!uploadUrlResponse.ok) {
        const errorText = await uploadUrlResponse.text();
        console.error("Upload URL error:", errorText);
        throw new Error("Failed to get upload URL");
      }

      const uploadUrlData = await uploadUrlResponse.json();
      const uploadUrl = uploadUrlData.uploadURL || uploadUrlData.url;

      if (!uploadUrl) {
        throw new Error("No upload URL returned from server");
      }

      // Upload file
      const uploadResponse = await fetch(uploadUrl, {
        method: "PUT",
        body: file,
        headers: {
          "Content-Type": "image/png",
        },
      });

      if (!uploadResponse.ok) {
        const errorText = await uploadResponse.text();
        console.error("Upload error:", errorText);
        throw new Error("Failed to upload signature");
      }

      // Extract object path from upload URL or use the objectPath from response
      let signatureUrl: string;
      if (uploadUrlData.objectPath) {
        signatureUrl = uploadUrlData.objectPath;
      } else if (uploadUrl.includes("/api/storage/upload/")) {
        // Extract path from Supabase storage URL
        const match = uploadUrl.match(/\/api\/storage\/upload\/([^/]+)\/(.+)/);
        if (match) {
          signatureUrl = `${match[1]}/${match[2]}`;
        } else {
          signatureUrl = uploadUrl.split("?")[0];
        }
      } else {
        signatureUrl = uploadUrl.split("?")[0];
      }

      submitSignatureMutation.mutate({
        orderId: selectedOrderForSignature.id,
        signatureUrl,
        type: signatureType,
      });
    } catch (error: any) {
      toast({
        title: "Upload Error",
        description: error.message || "Failed to upload signature",
        variant: "destructive",
      });
    }
  };

  const handleOrderClick = (depot: any) => {
    setSelectedDepot(depot);
    setOrderDialogOpen(true);
    if (depot.depot_prices && depot.depot_prices.length > 0) {
      setSelectedFuelType(depot.depot_prices[0].fuel_type_id);
    }
  };

  const handlePlaceOrder = () => {
    if (!selectedDepot || !selectedFuelType || !litres || !pickupDate) {
      toast({
        title: "Validation Error",
        description: "Please select fuel type, enter litres, and select pickup date",
        variant: "destructive",
      });
      return;
    }

    const litresNum = parseFloat(litres);
    if (isNaN(litresNum) || litresNum <= 0) {
      toast({
        title: "Validation Error",
        description: "Please enter a valid number of litres",
        variant: "destructive",
      });
      return;
    }

    // Validate order quantity is less than available stock
    const availableLitres = selectedFuelTypeData?.available_litres ?? 0;
    if (availableLitres > 0 && litresNum >= availableLitres) {
      toast({
        title: "Validation Error",
        description: `You can only order less than ${availableLitres}L. Available stock: ${availableLitres}L`,
        variant: "destructive",
      });
      return;
    }

    // Validate pickup date is in the future
    const pickupDateTime = new Date(pickupDate);
    if (pickupDateTime <= new Date()) {
      toast({
        title: "Validation Error",
        description: "Pickup date must be in the future",
        variant: "destructive",
      });
      return;
    }

    createOrderMutation.mutate({
      depotId: selectedDepot.id,
      fuelTypeId: selectedFuelType,
      litres: litresNum,
      pickupDate: pickupDate,
      notes: notes || undefined,
    });
  };

  const getStatusBadge = (order: any) => {
    const status = order.status;
    const paymentStatus = order.payment_status;
    
    const variants: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
      pending: "secondary",
      pending_payment: "outline",
      paid: "default",
      ready_for_pickup: "default",
      released: "default",
      awaiting_signature: "default",
      completed: "default",
      rejected: "destructive",
      cancelled: "destructive",
    };
    
    let displayStatus = status;
    if (status === "pending_payment") {
      if (paymentStatus === "paid" && order.payment_method === "bank_transfer") {
        displayStatus = "Waiting Payment Confirmation";
      } else if (paymentStatus === "payment_failed") {
        displayStatus = "Payment Failed";
      } else {
        displayStatus = "Awaiting Payment";
      }
    } else if (status === "paid") {
      displayStatus = "Awaiting Signatures";
    } else if (status === "ready_for_pickup") {
      displayStatus = "Ready for Pickup";
    } else if (status === "awaiting_signature") {
      displayStatus = "Awaiting Driver Signature";
    } else if (status === "released") {
      // Legacy status - should not be used anymore, but keep for backward compatibility
      displayStatus = "Awaiting Driver Signature";
    }
    
    return (
      <Badge variant={variants[status] || "secondary"}>
        {displayStatus.replace(/_/g, " ").split(" ").map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(" ")}
      </Badge>
    );
  };

  // Get all tiers for selected fuel type and find the appropriate tier based on quantity
  const getSelectedFuelTypeTier = (litres: number) => {
    if (!selectedDepot || !selectedFuelType) return null;
    
    const tiers = selectedDepot.depot_prices?.filter(
      (p: any) => p.fuel_type_id === selectedFuelType
    ) || [];
    
    if (tiers.length === 0) return null;
    
    // Sort tiers by min_litres descending to find the highest applicable tier
    const sortedTiers = [...tiers].sort((a: any, b: any) => {
      const aMin = parseFloat(a.min_litres?.toString() || "0");
      const bMin = parseFloat(b.min_litres?.toString() || "0");
      return bMin - aMin;
    });
    
    // Find the tier with highest min_litres that is <= order quantity
    for (const tier of sortedTiers) {
      const minLitres = parseFloat(tier.min_litres?.toString() || "0");
      if (litres >= minLitres) {
        return tier;
      }
    }
    
    // If no tier matches, use the tier with lowest min_litres (should be 0)
    return sortedTiers[sortedTiers.length - 1];
  };

  const selectedFuelTypeData = getSelectedFuelTypeTier(parseFloat(litres) || 0);

  return (
    <>
      {defaultTab === "orders" ? (
        <div className="space-y-4">
        {ordersLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : ordersError && (ordersError as any)?.status === 403 ? (
          <div className="text-center py-12">
            <div className="bg-yellow-50 dark:bg-yellow-950/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-6 max-w-md mx-auto">
              <p className="text-yellow-800 dark:text-yellow-200 font-medium mb-2">
                Compliance Review Required
              </p>
              <p className="text-sm text-yellow-700 dark:text-yellow-300 mb-4">
                Your compliance documents must be approved before you can view depot orders. Please complete your compliance profile and wait for admin approval.
              </p>
            </div>
          </div>
        ) : orders && orders.length > 0 ? (
          <div className="rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
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
                {orders.map((order: any) => (
                  <TableRow key={order.id}>
                    <TableCell className="font-medium">
                      {order.depots?.name || "Unknown"}
                    </TableCell>
                    <TableCell>
                      {order.fuel_types?.label || "Unknown"}
                    </TableCell>
                    <TableCell>{order.litres}L</TableCell>
                    <TableCell>
                      {formatCurrency(order.total_price_cents / 100, currency)}
                    </TableCell>
                    <TableCell>{getStatusBadge(order)}</TableCell>
                    <TableCell>
                      {new Date(order.created_at).toLocaleDateString()}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex gap-2 justify-end">
                        {order.status === "pending" && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              if (
                                confirm(
                                  "Are you sure you want to cancel this order?"
                                )
                              ) {
                                cancelOrderMutation.mutate(order.id);
                              }
                            }}
                            disabled={cancelOrderMutation.isPending}
                            className="text-destructive hover:text-destructive hover:bg-destructive/10"
                            title="Cancel order"
                          >
                            {cancelOrderMutation.isPending ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <XCircle className="h-4 w-4" />
                            )}
                          </Button>
                        )}
                        {(order.status === "pending_payment" || (order.status === "pending_payment" && order.payment_status === "payment_failed")) && (
                          <Button
                            variant={order.payment_status === "payment_failed" ? "destructive" : "default"}
                            size="sm"
                            onClick={() => {
                              setSelectedOrderForPayment(order);
                              setPaymentDialogOpen(true);
                            }}
                            title={order.payment_status === "payment_failed" ? "Payment was rejected. Pay again" : "Pay for order"}
                          >
                            <CreditCard className="h-4 w-4 mr-1" />
                            {order.payment_status === "payment_failed" ? "Pay Again" : "Pay Now"}
                          </Button>
                        )}
                        {(order.status === "awaiting_signature" || order.status === "released") && !order.delivery_signature_url && (
                          <Button
                            variant="default"
                            size="sm"
                            onClick={() => {
                              setSelectedOrderForSignature(order);
                              setSignatureType("delivery");
                              setSignatureDialogOpen(true);
                            }}
                            title="Sign to confirm receipt"
                          >
                            <FileSignature className="h-4 w-4 mr-1" />
                            Sign for Receipt
                          </Button>
                        )}
                        {order.status === "completed" && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setSelectedOrderForReceipt(order);
                              setReceiptViewDialogOpen(true);
                            }}
                            title="View receipt"
                          >
                            <Receipt className="h-4 w-4 mr-1" />
                            Receipt
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : (
          <div className="text-center py-12 text-muted-foreground">
            <Package className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>No orders yet</p>
            <p className="text-sm mt-2">
              Order fuel from depots to get started
            </p>
          </div>
        )}
        </div>
      ) : (
        <div className="space-y-4">
          {depotsError && (depotsError as any)?.status === 403 ? (
            <div className="text-center py-12">
              <div className="bg-yellow-50 dark:bg-yellow-950/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-6 max-w-md mx-auto">
                <p className="text-yellow-800 dark:text-yellow-200 font-medium mb-2">
                  Compliance Review Required
                </p>
                <p className="text-sm text-yellow-700 dark:text-yellow-300 mb-4">
                  Your compliance documents must be approved before you can view depots. Please complete your compliance profile and wait for admin approval.
                </p>
              </div>
            </div>
          ) : depotsError ? (
            <div className="text-center py-12 text-destructive">
              <p>Error loading depots: {depotsError instanceof Error ? depotsError.message : "Unknown error"}</p>
              <Button 
                onClick={() => queryClient.invalidateQueries({ queryKey: ["/api/driver/depots"] })}
                className="mt-4"
              >
                Retry
              </Button>
            </div>
          ) : depotsLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : depots && depots.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {depots.map((depot: any) => (
              <Card key={depot.id}>
                <CardHeader>
                  <CardTitle className="flex items-center justify-between">
                    <span>{depot.name}</span>
                    {depot.distance_km !== null && (
                      <Badge variant="outline">
                        {depot.distance_km.toFixed(1)} km
                      </Badge>
                    )}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <div className="flex items-start text-sm text-muted-foreground">
                      <MapPin className="h-4 w-4 mr-2 mt-0.5 flex-shrink-0" />
                      <div className="flex-1">
                        {depot.address_street && (
                          <div>{depot.address_street}</div>
                        )}
                        <div>
                          {[
                            depot.address_city,
                            depot.address_province,
                            depot.address_postal_code
                          ].filter(Boolean).join(", ")}
                        </div>
                        {!depot.address_street && !depot.address_city && !depot.address_province && !depot.address_postal_code && (
                          <div className="text-xs italic">Address not available</div>
                        )}
                      </div>
                    </div>
                    {depot.suppliers && (
                      <div className="text-sm text-muted-foreground">
                        Supplier: {depot.suppliers.name || depot.suppliers.registered_name}
                      </div>
                    )}
                  </div>

                  {depot.depot_prices && depot.depot_prices.length > 0 && (
                    <div className="space-y-2">
                      <div className="text-sm font-medium">Available Fuel:</div>
                      <div className="space-y-3">
                        {(() => {
                          // Group prices by fuel_type_id to show tiers together
                          const pricesByFuelType = depot.depot_prices.reduce((acc: any, price: any) => {
                            const fuelTypeId = price.fuel_type_id;
                            if (!acc[fuelTypeId]) {
                              acc[fuelTypeId] = {
                                fuelType: price.fuel_types,
                                tiers: [],
                                stock: price.available_litres ?? 0,
                              };
                            }
                            acc[fuelTypeId].tiers.push(price);
                            return acc;
                          }, {});

                          return Object.values(pricesByFuelType).map((group: any) => {
                            const sortedTiers = [...group.tiers].sort((a: any, b: any) => 
                              parseFloat(a.min_litres?.toString() || "0") - parseFloat(b.min_litres?.toString() || "0")
                            );

                            const getTierRange = (tier: any, index: number) => {
                              const minLitres = Number(tier.min_litres) || 0;
                              const nextTier = sortedTiers[index + 1];
                              if (nextTier) {
                                const nextMin = Number(nextTier.min_litres) || 0;
                                if (nextMin > minLitres) {
                                  return `${minLitres}L - ${nextMin - 1}L`;
                                }
                              }
                              return `${minLitres}L+`;
                            };

                            return (
                              <div key={group.fuelType?.id} className="border-2 rounded-lg p-3 bg-card shadow-sm space-y-2">
                                <div className="flex items-center justify-between">
                                  <div className="font-semibold text-sm">
                                    {group.fuelType?.label || "Unknown"}
                                  </div>
                                  <div className="text-xs font-medium text-primary">
                                    Stock: {group.stock}L
                                  </div>
                                </div>
                                <div className="space-y-1.5 pt-2 border-t">
                                  <div className="text-xs text-muted-foreground mb-1">Pricing Tiers:</div>
                                  {sortedTiers.map((tier: any, index: number) => (
                                    <div 
                                      key={tier.id} 
                                      className="flex justify-between items-center text-xs bg-muted/50 rounded px-2 py-1.5"
                                    >
                                      <span className="text-muted-foreground font-medium">
                                        {getTierRange(tier, index)}:
                                      </span>
                                      <span className="font-semibold text-foreground">
                                        {formatCurrency(tier.price_cents / 100, currency)}/L
                                      </span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            );
                          });
                        })()}
                      </div>
                    </div>
                  )}

                  <Button
                    onClick={() => handleOrderClick(depot)}
                    className="w-full"
                    size="sm"
                  >
                    <ShoppingCart className="h-4 w-4 mr-2" />
                    Order Fuel
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <div className="text-center py-12 text-muted-foreground">
            <Package className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>No depots available</p>
          </div>
        )}
        </div>
      )}

      {/* Order Dialog */}
      <Dialog open={orderDialogOpen} onOpenChange={setOrderDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Order Fuel from {selectedDepot?.name}</DialogTitle>
            <DialogDescription>
              Place an order for fuel from this depot
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="fuelType">Fuel Type *</Label>
              <select
                id="fuelType"
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={selectedFuelType || ""}
                onChange={(e) => {
                  setSelectedFuelType(e.target.value);
                  setLitres(""); // Reset litres when fuel type changes
                }}
              >
                <option value="">Select fuel type</option>
                {(() => {
                  // Get unique fuel types
                  const fuelTypesMap = new Map();
                  selectedDepot?.depot_prices?.forEach((price: any) => {
                    if (!fuelTypesMap.has(price.fuel_type_id)) {
                      fuelTypesMap.set(price.fuel_type_id, price.fuel_types);
                    }
                  });
                  return Array.from(fuelTypesMap.entries()).map(([fuelTypeId, fuelType]: [string, any]) => (
                    <option key={fuelTypeId} value={fuelTypeId}>
                      {fuelType?.label || "Unknown"}
                    </option>
                  ));
                })()}
              </select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="litres">Litres *</Label>
              <Input
                id="litres"
                type="number"
                min="1"
                step="0.1"
                value={litres}
                onChange={(e) => setLitres(e.target.value)}
                placeholder="Enter number of litres"
              />
            </div>

            {selectedFuelTypeData && (
              <div className="p-3 bg-muted rounded-md space-y-2">
                <div className="flex justify-between text-sm">
                  <span>Available Stock:</span>
                  <span className={`font-medium ${
                    litres && parseFloat(litres) >= (selectedFuelTypeData.available_litres ?? 0)
                      ? "text-destructive" 
                      : "text-foreground"
                  }`}>
                    {(selectedFuelTypeData.available_litres ?? 0)}L
                  </span>
                </div>
                {litres && parseFloat(litres) > 0 && (
                  <>
                    <div className="flex justify-between text-sm">
                      <span>Price per litre:</span>
                      <span className="font-medium">
                        {formatCurrency(
                          selectedFuelTypeData.price_cents / 100,
                          currency
                        )}
                      </span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span>Total:</span>
                      <span className="font-bold">
                        {formatCurrency(
                          (selectedFuelTypeData.price_cents / 100) *
                            parseFloat(litres),
                          currency
                        )}
                      </span>
                    </div>
                    {parseFloat(litres) >= (selectedFuelTypeData.available_litres ?? 0) && (
                      <p className="text-xs text-destructive mt-1">
                        Order quantity must be less than available stock
                      </p>
                    )}
                  </>
                )}
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="pickupDate">Pickup Date *</Label>
              <Input
                id="pickupDate"
                type="datetime-local"
                value={pickupDate}
                onChange={(e) => setPickupDate(e.target.value)}
                min={new Date().toISOString().slice(0, 16)}
                required
              />
              <p className="text-xs text-muted-foreground">
                Select the date and time when you will pick up the fuel from this depot
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="notes">Notes (Optional)</Label>
              <textarea
                id="notes"
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm min-h-[80px]"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Any special instructions or notes..."
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setOrderDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button
              onClick={handlePlaceOrder}
              disabled={
                createOrderMutation.isPending || 
                !selectedFuelType || 
                !litres || 
                !pickupDate ||
                (selectedFuelTypeData && (selectedFuelTypeData.available_litres ?? 0) > 0 && parseFloat(litres) >= (selectedFuelTypeData.available_litres ?? 0))
              }
            >
              {createOrderMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Placing Order...
                </>
              ) : (
                "Place Order"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Payment Dialog */}
      {selectedOrderForPayment && (
        <DriverDepotOrderPaymentDialog
          open={paymentDialogOpen}
          onOpenChange={setPaymentDialogOpen}
          order={selectedOrderForPayment}
          supplierBankDetails={{}}
        />
      )}

      {/* Signature Dialog */}
      <Dialog open={signatureDialogOpen} onOpenChange={setSignatureDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {signatureType === "delivery" ? "Sign to Confirm Receipt" : "Sign Agreement"}
            </DialogTitle>
            <DialogDescription>
              {signatureType === "delivery" 
                ? "Please sign to confirm that you have received the fuel. This will complete the order."
                : "Please sign to confirm the order details before fuel release."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {selectedOrderForSignature && (
              <div className="bg-muted/50 rounded-lg p-4 space-y-2 text-sm">
                <p><span className="font-semibold">Depot:</span> {selectedOrderForSignature.depots?.name}</p>
                <p><span className="font-semibold">Fuel Type:</span> {selectedOrderForSignature.fuel_types?.label}</p>
                <p><span className="font-semibold">Quantity:</span> {selectedOrderForSignature.litres}L</p>
                <p><span className="font-semibold">Total:</span> {formatCurrency(selectedOrderForSignature.total_price_cents / 100, currency)}</p>
              </div>
            )}
            <SignaturePad
              value={signatureData}
              onChange={setSignatureData}
              height={200}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSignatureDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleSubmitSignature}
              disabled={!signatureData || submitSignatureMutation.isPending}
            >
              {submitSignatureMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Submitting...
                </>
              ) : (
                "Submit Signature"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Receipt Confirmation Dialog */}
      <Dialog open={receiptDialogOpen} onOpenChange={setReceiptDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm Receipt</DialogTitle>
            <DialogDescription>
              Please sign to confirm you have received the fuel.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {selectedOrderForSignature && (
              <div className="bg-muted/50 rounded-lg p-4 space-y-2 text-sm">
                <p><span className="font-semibold">Depot:</span> {selectedOrderForSignature.depots?.name}</p>
                <p><span className="font-semibold">Fuel Type:</span> {selectedOrderForSignature.fuel_types?.label}</p>
                <p><span className="font-semibold">Ordered:</span> {selectedOrderForSignature.litres}L</p>
                {selectedOrderForSignature.actual_litres_delivered && (
                  <p><span className="font-semibold">Received:</span> {selectedOrderForSignature.actual_litres_delivered}L</p>
                )}
              </div>
            )}
            <SignaturePad
              value={signatureData}
              onChange={setSignatureData}
              height={200}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReceiptDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleSubmitSignature}
              disabled={!signatureData || submitSignatureMutation.isPending}
            >
              {submitSignatureMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Confirming...
                </>
              ) : (
                "Confirm Receipt"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Receipt View Dialog */}
      <DriverDepotOrderReceipt
        order={selectedOrderForReceipt}
        open={receiptViewDialogOpen}
        onOpenChange={setReceiptViewDialogOpen}
      />
    </>
  );
}

