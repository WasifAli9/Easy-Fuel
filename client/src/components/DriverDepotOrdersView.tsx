import { useState, useEffect } from "react";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Package, CheckCircle, XCircle, CreditCard, FileSignature, Eye, Fuel, Receipt, AlertCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { formatCurrency } from "@/lib/utils";
import { useCurrency } from "@/hooks/use-currency";
import { SignaturePad } from "@/components/SignaturePad";
import { DriverDepotOrderReceipt } from "@/components/DriverDepotOrderReceipt";

interface DriverDepotOrdersViewProps {
  statusFilter?: string[] | null;
}

export function DriverDepotOrdersView({ statusFilter }: DriverDepotOrdersViewProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { currency } = useCurrency();
  const [paymentProofDialogOpen, setPaymentProofDialogOpen] = useState(false);
  const [selectedOrderForProof, setSelectedOrderForProof] = useState<any>(null);
  const [proofImageError, setProofImageError] = useState(false);
  const [proofIsLoading, setProofIsLoading] = useState(true);
  const [proofUrl, setProofUrl] = useState<string | null>(null);
  
  // Fetch presigned URL when selectedOrderForProof changes
  useEffect(() => {
    const fetchPresignedUrl = async () => {
      if (!selectedOrderForProof?.payment_proof_url) {
        setProofUrl(null);
        return;
      }
      
      setProofIsLoading(true);
      setProofImageError(false);
      
      let objectPath = selectedOrderForProof.payment_proof_url;
      
      // If already a full URL, use it directly
      if (objectPath.startsWith('http://') || objectPath.startsWith('https://')) {
        setProofUrl(objectPath);
        setProofIsLoading(false);
        return;
      }
      
      // Clean up the path
      objectPath = objectPath.replace(/^\/+/, '');
      
      // Ensure proper format
      if (!objectPath.includes('/')) {
        objectPath = `private-objects/uploads/${objectPath}`;
      } else if (!objectPath.startsWith('private-objects/') && !objectPath.startsWith('public-objects/')) {
        objectPath = `private-objects/${objectPath}`;
      }
      
      try {
        console.log('Fetching presigned URL for objectPath:', objectPath);
        const response = await apiRequest("POST", "/api/objects/presigned-url", { objectPath });
        
        // apiRequest returns a Response object, so we need to parse the JSON
        const responseData = await response.json();
        console.log('Presigned URL response data:', responseData);
        
        if (responseData.signedUrl) {
          console.log('Using presigned URL:', responseData.signedUrl);
          setProofUrl(responseData.signedUrl);
        } else {
          console.error('No signedUrl in response:', responseData);
          setProofImageError(true);
        }
      } catch (error: any) {
        console.error("Error fetching presigned URL:", error);
        console.error("Error details:", error.message, error.stack);
        // Fallback to direct endpoint - this requires authentication but might work
        console.log('Falling back to direct endpoint:', `/api/objects/${objectPath}`);
        setProofUrl(`/api/objects/${objectPath}`);
      } finally {
        setProofIsLoading(false);
      }
    };
    
    fetchPresignedUrl();
  }, [selectedOrderForProof?.payment_proof_url]);
  const [signatureDialogOpen, setSignatureDialogOpen] = useState(false);
  const [selectedOrderForSignature, setSelectedOrderForSignature] = useState<any>(null);
  const [signatureData, setSignatureData] = useState<string | null>(null);
  const [deliveryDialogOpen, setDeliveryDialogOpen] = useState(false);
  const [selectedOrderForDelivery, setSelectedOrderForDelivery] = useState<any>(null);
  const [receiptDialogOpen, setReceiptDialogOpen] = useState(false);
  const [selectedOrderForReceipt, setSelectedOrderForReceipt] = useState<any>(null);

  const { data: orders, isLoading } = useQuery<any[]>({
    queryKey: ["/api/supplier/driver-depot-orders"],
    refetchInterval: 10000, // Refresh every 10 seconds
  });

  // Filter orders based on statusFilter
  // Also include completed orders from the last week when no filter is applied
  const oneWeekAgo = new Date();
  oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
  
  const filteredOrders = statusFilter && statusFilter.length > 0
    ? (orders || []).filter((order: any) => statusFilter.includes(order.status))
    : (orders || []).filter((order: any) => {
        // Show all non-completed orders
        if (order.status !== "completed") {
          return true;
        }
        // For completed orders, only show those from the last week
        const orderDate = new Date(order.completed_at || order.updated_at || order.created_at);
        return orderDate >= oneWeekAgo;
      });

  // Accept order mutation
  const acceptOrderMutation = useMutation({
    mutationFn: async (orderId: string) => {
      return apiRequest("POST", `/api/supplier/driver-depot-orders/${orderId}/accept`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/supplier/driver-depot-orders"] });
      toast({ title: "Order Accepted", description: "Order has been accepted. Driver can now proceed with payment." });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  // Reject order mutation
  const rejectOrderMutation = useMutation({
    mutationFn: async ({ orderId, reason }: { orderId: string; reason?: string }) => {
      return apiRequest("POST", `/api/supplier/driver-depot-orders/${orderId}/reject`, { reason });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/supplier/driver-depot-orders"] });
      toast({ title: "Order Rejected", description: "Order has been rejected." });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  // Verify payment mutation
  const verifyPaymentMutation = useMutation({
    mutationFn: async (orderId: string) => {
      return apiRequest("POST", `/api/supplier/driver-depot-orders/${orderId}/verify-payment`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/supplier/driver-depot-orders"] });
      toast({ title: "Payment Confirmed", description: "Payment has been confirmed. Order is ready for signatures." });
      setPaymentProofDialogOpen(false);
      setSelectedOrderForProof(null);
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  // Reject payment mutation
  const rejectPaymentMutation = useMutation({
    mutationFn: async ({ orderId, reason }: { orderId: string; reason?: string }) => {
      return apiRequest("POST", `/api/supplier/driver-depot-orders/${orderId}/reject-payment`, { reason });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/supplier/driver-depot-orders"] });
      toast({ title: "Payment Rejected", description: "Payment has been marked as not received. Driver will be notified." });
      setPaymentProofDialogOpen(false);
      setSelectedOrderForProof(null);
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  // Submit supplier signature mutation
  const submitSignatureMutation = useMutation({
    mutationFn: async ({ orderId, signatureUrl }: { orderId: string; signatureUrl: string }) => {
      return apiRequest("POST", `/api/supplier/driver-depot-orders/${orderId}/supplier-signature`, { signatureUrl });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/supplier/driver-depot-orders"] });
      toast({ title: "Signature Submitted", description: "Your signature has been submitted." });
      setSignatureDialogOpen(false);
      setSignatureData(null);
      setSelectedOrderForSignature(null);
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  // Release fuel mutation
  const releaseFuelMutation = useMutation({
    mutationFn: async (orderId: string) => {
      return apiRequest("POST", `/api/supplier/driver-depot-orders/${orderId}/release`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/supplier/driver-depot-orders"] });
      toast({ title: "Fuel Released", description: "Fuel has been released. Driver will be notified to sign for receipt." });
      setDeliveryDialogOpen(false);
      setSelectedOrderForDelivery(null);
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const handleSubmitSignature = async () => {
    if (!signatureData || !selectedOrderForSignature) {
      toast({ title: "Validation Error", description: "Please provide a signature", variant: "destructive" });
      return;
    }

    try {
      const response = await fetch(signatureData);
      const blob = await response.blob();
      const file = new File([blob], "signature.png", { type: "image/png" });

      const { getAuthHeaders } = await import("@/lib/auth-headers");
      const headers = await getAuthHeaders();
      
      // Get upload URL using the correct endpoint
      const uploadUrlResponse = await fetch("/api/objects/upload", { 
        method: "POST", 
        headers 
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

      const uploadResponse = await fetch(uploadUrl, {
        method: "PUT",
        body: file,
        headers: { "Content-Type": "image/png" },
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
      submitSignatureMutation.mutate({ orderId: selectedOrderForSignature.id, signatureUrl });
    } catch (error: any) {
      toast({ title: "Upload Error", description: error.message || "Failed to upload signature", variant: "destructive" });
    }
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
            : "Driver orders from your depots will appear here. Completed orders from the last week are also shown."}
        </p>
      </div>
    );
  }

  return (
    <>
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
              <TableCell>{getStatusBadge(order)}</TableCell>
              <TableCell>
                {new Date(order.created_at).toLocaleDateString()}
              </TableCell>
              <TableCell className="text-right">
                <div className="flex gap-2 justify-end">
                  {order.status === "pending" && (
                    <>
                      <Button
                        variant="default"
                        size="sm"
                        onClick={() => acceptOrderMutation.mutate(order.id)}
                        disabled={acceptOrderMutation.isPending}
                      >
                        <CheckCircle className="h-4 w-4 mr-1" />
                        Accept
                      </Button>
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => {
                          const reason = prompt("Reason for rejection (optional):");
                          rejectOrderMutation.mutate({ orderId: order.id, reason: reason || undefined });
                        }}
                        disabled={rejectOrderMutation.isPending}
                      >
                        <XCircle className="h-4 w-4 mr-1" />
                        Reject
                      </Button>
                    </>
                  )}
                  {order.status === "pending_payment" && order.payment_status === "paid" && order.payment_method === "bank_transfer" && order.payment_proof_url && (
                    <>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setSelectedOrderForProof(order);
                          setPaymentProofDialogOpen(true);
                        }}
                      >
                        <Eye className="h-4 w-4 mr-1" />
                        View Proof
                      </Button>
                      <Button
                        variant="default"
                        size="sm"
                        onClick={() => verifyPaymentMutation.mutate(order.id)}
                        disabled={verifyPaymentMutation.isPending}
                      >
                        <CheckCircle className="h-4 w-4 mr-1" />
                        Confirm Payment
                      </Button>
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => {
                          const reason = prompt("Reason for rejection (optional):");
                          rejectPaymentMutation.mutate({ orderId: order.id, reason: reason || undefined });
                        }}
                        disabled={rejectPaymentMutation.isPending}
                      >
                        <XCircle className="h-4 w-4 mr-1" />
                        Not Received
                      </Button>
                    </>
                  )}
                  {order.status === "ready_for_pickup" && (
                    <Button
                      variant="default"
                      size="sm"
                      onClick={() => {
                        setSelectedOrderForDelivery(order);
                        setDeliveryDialogOpen(true);
                      }}
                    >
                      <Fuel className="h-4 w-4 mr-1" />
                      Release Fuel
                    </Button>
                  )}
                  {order.status === "completed" && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setSelectedOrderForReceipt(order);
                        setReceiptDialogOpen(true);
                      }}
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

    {/* Payment Proof Dialog */}
    <Dialog open={paymentProofDialogOpen} onOpenChange={(open) => {
      setPaymentProofDialogOpen(open);
      if (!open) {
        // Reset state when dialog closes
        setProofImageError(false);
        setProofIsLoading(true);
        setProofUrl(null);
        setSelectedOrderForProof(null);
      } else {
        // Reset state when dialog opens
        setProofImageError(false);
        setProofIsLoading(true);
        setProofUrl(null);
      }
    }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Payment Proof</DialogTitle>
          <DialogDescription>
            Review the payment proof submitted by the driver. You can view the image or PDF and confirm or reject the payment.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          {selectedOrderForProof?.payment_proof_url && (() => {
            if (!proofUrl && proofIsLoading) {
              return (
                <div className="flex items-center justify-center h-96 border rounded">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                  <span className="ml-2 text-muted-foreground">Loading payment proof...</span>
                </div>
              );
            }
            
            if (!proofUrl) {
              return (
                <div className="flex flex-col items-center justify-center h-96 border rounded bg-muted/50">
                  <AlertCircle className="h-12 w-12 text-destructive mb-2" />
                  <p className="text-sm text-muted-foreground mb-2">Unable to load payment proof</p>
                </div>
              );
            }
            
            // Check if it's a PDF based on URL or content type
            const originalUrl = selectedOrderForProof.payment_proof_url.toLowerCase();
            const isPDF = originalUrl.endsWith('.pdf') || originalUrl.includes('.pdf') || proofUrl.toLowerCase().includes('.pdf');
            
            return (
              <div className="space-y-2">
                {proofIsLoading && (
                  <div className="flex items-center justify-center h-96 border rounded">
                    <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                    <span className="ml-2 text-muted-foreground">Loading payment proof...</span>
                  </div>
                )}
                {!proofIsLoading && isPDF ? (
                  <div className="flex flex-col items-center justify-center h-96 border rounded bg-muted/30">
                    <p className="text-sm text-muted-foreground mb-4">PDF Document</p>
                    <Button
                      variant="default"
                      size="lg"
                      onClick={() => {
                        window.open(proofUrl, '_blank');
                      }}
                    >
                      <Eye className="h-4 w-4 mr-2" />
                      Open in New Tab
                    </Button>
                  </div>
                ) : !proofIsLoading && (
                  <div className="space-y-2">
                    {!proofImageError ? (
                      <img
                        src={proofUrl}
                        alt="Payment proof"
                        className="w-full rounded border max-h-96 object-contain"
                        onLoad={() => setProofIsLoading(false)}
                        onError={(e) => {
                          setProofIsLoading(false);
                          setProofImageError(true);
                          (e.target as HTMLImageElement).style.display = 'none';
                        }}
                      />
                    ) : (
                      <div className="flex flex-col items-center justify-center h-96 border rounded bg-muted/50">
                        <p className="text-sm text-muted-foreground mb-4">Unable to load image</p>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            window.open(proofUrl, '_blank');
                          }}
                        >
                          <Eye className="h-4 w-4 mr-2" />
                          Open in New Tab
                        </Button>
                      </div>
                    )}
                  </div>
                )}
                <div className="bg-muted/50 rounded-lg p-3 space-y-1 text-sm">
                  <p className="font-semibold">Order Details:</p>
                  <p><span className="text-muted-foreground">Payment Method:</span> {selectedOrderForProof.payment_method?.replace(/_/g, " ").replace(/\b\w/g, l => l.toUpperCase())}</p>
                  <p><span className="text-muted-foreground">Driver:</span> {selectedOrderForProof.drivers?.profile?.full_name || "Unknown"}</p>
                  <p><span className="text-muted-foreground">Amount:</span> {formatCurrency(selectedOrderForProof.total_price_cents / 100, currency)}</p>
                </div>
              </div>
            );
          })()}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setPaymentProofDialogOpen(false)}>
            Close
          </Button>
          <Button
            variant="destructive"
            onClick={() => {
              if (selectedOrderForProof) {
                const reason = prompt("Reason for rejection (optional):");
                rejectPaymentMutation.mutate({ orderId: selectedOrderForProof.id, reason: reason || undefined });
              }
            }}
            disabled={rejectPaymentMutation.isPending}
          >
            {rejectPaymentMutation.isPending ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Rejecting...
              </>
            ) : (
              <>
                <XCircle className="h-4 w-4 mr-2" />
                Not Received
              </>
            )}
          </Button>
          <Button
            onClick={() => {
              if (selectedOrderForProof) {
                verifyPaymentMutation.mutate(selectedOrderForProof.id);
              }
            }}
            disabled={verifyPaymentMutation.isPending}
          >
            {verifyPaymentMutation.isPending ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Confirming...
              </>
            ) : (
              <>
                <CheckCircle className="h-4 w-4 mr-2" />
                Confirm Payment
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    {/* Signature Dialog */}
    <Dialog open={signatureDialogOpen} onOpenChange={setSignatureDialogOpen}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Sign Agreement</DialogTitle>
          <DialogDescription>
            Please sign to confirm the order details before fuel release.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          {selectedOrderForSignature && (
            <div className="bg-muted/50 rounded-lg p-4 space-y-2 text-sm">
              <p><span className="font-semibold">Driver:</span> {selectedOrderForSignature.drivers?.profile?.full_name || "Unknown"}</p>
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

    {/* Delivery Confirmation Dialog */}
    <Dialog open={deliveryDialogOpen} onOpenChange={setDeliveryDialogOpen}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Release Fuel</DialogTitle>
          <DialogDescription>
            Release the fuel for this order. The driver will be notified to sign for receipt.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          {selectedOrderForDelivery && (
            <div className="bg-muted/50 rounded-lg p-4 space-y-2 text-sm">
              <p><span className="font-semibold">Driver:</span> {selectedOrderForDelivery.drivers?.profile?.full_name || "Unknown"}</p>
              <p><span className="font-semibold">Fuel Type:</span> {selectedOrderForDelivery.fuel_types?.label}</p>
              <p><span className="font-semibold">Quantity:</span> {selectedOrderForDelivery.litres}L</p>
              <p><span className="font-semibold">Total:</span> {formatCurrency(selectedOrderForDelivery.total_price_cents / 100, currency)}</p>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setDeliveryDialogOpen(false)}>
            Cancel
          </Button>
          <Button
            onClick={() => {
              if (selectedOrderForDelivery) {
                releaseFuelMutation.mutate(selectedOrderForDelivery.id);
              }
            }}
            disabled={releaseFuelMutation.isPending}
          >
            {releaseFuelMutation.isPending ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Releasing...
              </>
            ) : (
              <>
                <Fuel className="h-4 w-4 mr-2" />
                Release Fuel
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    {/* Receipt Dialog */}
    <DriverDepotOrderReceipt
      order={selectedOrderForReceipt}
      open={receiptDialogOpen}
      onOpenChange={setReceiptDialogOpen}
    />
    </>
  );
}

