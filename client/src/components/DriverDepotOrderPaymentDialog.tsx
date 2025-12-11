import { useState } from "react";
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
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Input } from "@/components/ui/input";
import { Loader2, CreditCard, Building2, Wallet, Upload } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { formatCurrency } from "@/lib/utils";
import { useCurrency } from "@/hooks/use-currency";
import { ObjectUploader } from "@/components/ObjectUploader";
import { getAuthHeaders } from "@/lib/auth-headers";

interface DriverDepotOrderPaymentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  order: any;
  supplierBankDetails?: {
    bankName?: string;
    accountNumber?: string;
    branchCode?: string;
    accountHolderName?: string;
  };
}

export function DriverDepotOrderPaymentDialog({
  open,
  onOpenChange,
  order,
  supplierBankDetails,
}: DriverDepotOrderPaymentDialogProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { currency } = useCurrency();
  const [paymentMethod, setPaymentMethod] = useState<"bank_transfer" | "online_payment" | "pay_outside_app" | null>(null);
  const [paymentProofUrl, setPaymentProofUrl] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  const submitPaymentMutation = useMutation({
    mutationFn: async (data: { paymentMethod: string; paymentProofUrl?: string }) => {
      return apiRequest("POST", `/api/driver/depot-orders/${order.id}/payment`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/driver/depot-orders"] });
      toast({
        title: "Payment Submitted",
        description: paymentMethod === "online_payment" 
          ? "Payment processed successfully. Order is now ready for pickup."
          : paymentMethod === "bank_transfer"
          ? "Payment proof uploaded. Waiting for supplier confirmation."
          : "Payment method recorded. Supplier will confirm payment later.",
      });
      onOpenChange(false);
      setPaymentMethod(null);
      setPaymentProofUrl(null);
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleFileUpload = async (file: File) => {
    setIsUploading(true);
    try {
      const headers = await getAuthHeaders();
      
      // Get upload URL first
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
          "Content-Type": file.type || "application/octet-stream",
        },
      });

      if (!uploadResponse.ok) {
        const errorText = await uploadResponse.text();
        console.error("Upload error:", errorText);
        throw new Error("Upload failed");
      }

      // Extract object path
      let uploadedUrl: string;
      if (uploadUrlData.objectPath) {
        uploadedUrl = uploadUrlData.objectPath;
      } else if (uploadUrl.includes("/api/storage/upload/")) {
        const match = uploadUrl.match(/\/api\/storage\/upload\/([^/]+)\/(.+)/);
        if (match) {
          uploadedUrl = `${match[1]}/${match[2]}`;
        } else {
          uploadedUrl = uploadUrl.split("?")[0];
        }
      } else {
        uploadedUrl = uploadUrl.split("?")[0];
      }

      setPaymentProofUrl(uploadedUrl);
      toast({
        title: "Upload Successful",
        description: "Payment proof uploaded successfully.",
      });
    } catch (error: any) {
      toast({
        title: "Upload Error",
        description: error.message || "Failed to upload payment proof",
        variant: "destructive",
      });
    } finally {
      setIsUploading(false);
    }
  };

  const handleSubmit = () => {
    if (!paymentMethod) {
      toast({
        title: "Validation Error",
        description: "Please select a payment method",
        variant: "destructive",
      });
      return;
    }

    if (paymentMethod === "bank_transfer" && !paymentProofUrl) {
      toast({
        title: "Validation Error",
        description: "Please upload proof of payment",
        variant: "destructive",
      });
      return;
    }

    submitPaymentMutation.mutate({
      paymentMethod,
      paymentProofUrl: paymentProofUrl || undefined,
    });
  };

  const totalPrice = order.total_price_cents / 100;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Pay for Order</DialogTitle>
          <DialogDescription>
            Select a payment method for your order from {order.depots?.name}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Order Summary */}
          <div className="bg-muted/50 rounded-lg p-4 space-y-2">
            <h4 className="font-semibold text-sm">Order Summary</h4>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div>
                <span className="text-muted-foreground">Fuel Type:</span>
                <span className="ml-2 font-medium">{order.fuel_types?.label}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Quantity:</span>
                <span className="ml-2 font-medium">{order.litres}L</span>
              </div>
              <div>
                <span className="text-muted-foreground">Price per litre:</span>
                <span className="ml-2 font-medium">
                  {formatCurrency(order.price_per_litre_cents / 100, currency)}/L
                </span>
              </div>
              <div>
                <span className="text-muted-foreground">Total:</span>
                <span className="ml-2 font-bold text-lg">
                  {formatCurrency(totalPrice, currency)}
                </span>
              </div>
            </div>
          </div>

          {/* Payment Method Selection */}
          <div className="space-y-4">
            <Label className="text-base font-semibold">Select Payment Method</Label>
            <RadioGroup value={paymentMethod || ""} onValueChange={(value) => setPaymentMethod(value as any)}>
              {/* Bank Transfer Option */}
              <div className="flex items-start space-x-3 p-4 border rounded-lg hover:bg-muted/50">
                <RadioGroupItem value="bank_transfer" id="bank_transfer" className="mt-1" />
                <div className="flex-1 space-y-2">
                  <Label htmlFor="bank_transfer" className="flex items-center gap-2 cursor-pointer">
                    <Building2 className="h-4 w-4" />
                    <span className="font-semibold">Bank Transfer (EFT)</span>
                  </Label>
                  <p className="text-sm text-muted-foreground">
                    Transfer funds to the supplier's bank account and upload proof of payment.
                  </p>
                  
                  {paymentMethod === "bank_transfer" && supplierBankDetails && (
                    <div className="mt-3 p-3 bg-background rounded border space-y-1 text-sm">
                      <p className="font-semibold mb-2">Supplier Bank Details:</p>
                      {supplierBankDetails.bankName && (
                        <p><span className="text-muted-foreground">Bank:</span> {supplierBankDetails.bankName}</p>
                      )}
                      {supplierBankDetails.accountNumber && (
                        <p><span className="text-muted-foreground">Account Number:</span> {supplierBankDetails.accountNumber}</p>
                      )}
                      {supplierBankDetails.branchCode && (
                        <p><span className="text-muted-foreground">Branch Code:</span> {supplierBankDetails.branchCode}</p>
                      )}
                      {supplierBankDetails.accountHolderName && (
                        <p><span className="text-muted-foreground">Account Holder:</span> {supplierBankDetails.accountHolderName}</p>
                      )}
                    </div>
                  )}

                  {paymentMethod === "bank_transfer" && (
                    <div className="mt-3 space-y-2">
                      <Label>Upload Proof of Payment</Label>
                      {paymentProofUrl ? (
                        <div className="flex items-center gap-2 p-2 bg-green-50 dark:bg-green-950/20 rounded">
                          <span className="text-sm text-green-700 dark:text-green-300">Proof uploaded</span>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setPaymentProofUrl(null)}
                          >
                            Remove
                          </Button>
                        </div>
                      ) : (
                        <ObjectUploader
                          maxFileSize={5242880}
                          allowedFileTypes={["image/*", "application/pdf"]}
                          onGetUploadParameters={async () => {
                            const headers = await getAuthHeaders();
                            const response = await fetch("/api/objects/upload", {
                              method: "POST",
                              headers,
                            });
                            if (!response.ok) {
                              const errorText = await response.text();
                              console.error("Upload URL error:", errorText);
                              throw new Error("Failed to get upload URL");
                            }
                            const data = await response.json();
                            let uploadURL = data.uploadURL || data.url;
                            
                            // Convert relative URLs to absolute for Uppy
                            if (uploadURL && !uploadURL.startsWith('http://') && !uploadURL.startsWith('https://')) {
                              if (uploadURL.startsWith('/')) {
                                uploadURL = window.location.origin + uploadURL;
                              } else {
                                uploadURL = window.location.origin + '/' + uploadURL;
                              }
                            }
                            
                            return { method: "PUT" as const, url: uploadURL };
                          }}
                          onComplete={async (result) => {
                            if (result.successful && result.successful.length > 0) {
                              const file = result.successful[0];
                              console.log('Upload complete, file:', file);
                              
                              // Uppy AwsS3 plugin stores the response in response.body or response.data
                              // The server returns { objectPath, path, fullPath, uploadURL, location, url }
                              let url: string | null = null;
                              
                              // Method 1: Check response.body (most common for Uppy AwsS3)
                              if ((file as any).response?.body) {
                                try {
                                  const responseBody = typeof (file as any).response.body === 'string'
                                    ? JSON.parse((file as any).response.body)
                                    : (file as any).response.body;
                                  if (responseBody?.objectPath) {
                                    url = responseBody.objectPath;
                                    console.log('Got objectPath from response.body:', url);
                                  }
                                } catch (e) {
                                  console.warn('Could not parse response.body:', e);
                                }
                              }
                              
                              // Method 2: Check response.data
                              if (!url && (file as any).response?.data) {
                                try {
                                  const responseData = typeof (file as any).response.data === 'string'
                                    ? JSON.parse((file as any).response.data)
                                    : (file as any).response.data;
                                  if (responseData?.objectPath) {
                                    url = responseData.objectPath;
                                    console.log('Got objectPath from response.data:', url);
                                  }
                                } catch (e) {
                                  console.warn('Could not parse response.data:', e);
                                }
                              }
                              
                              // Method 3: Check uploadURL and extract from it
                              if (!url) {
                                const uploadURL = (file as any).uploadURL || (file as any).url;
                                if (uploadURL && uploadURL.includes('/api/storage/upload/')) {
                                  const match = uploadURL.match(/\/api\/storage\/upload\/([^/]+)\/(.+)/);
                                  if (match) {
                                    url = `${match[1]}/${match[2]}`;
                                    console.log('Extracted path from upload URL:', url);
                                  }
                                }
                              }
                              
                              if (!url) {
                                console.error('Could not extract objectPath from upload result:', file);
                                toast({
                                  title: "Upload Error",
                                  description: "Could not determine file path. Please try again.",
                                  variant: "destructive",
                                });
                                return;
                              }
                              
                              console.log('Final payment proof URL to store:', url);
                              setPaymentProofUrl(url);
                            }
                          }}
                        >
                          <Upload className="h-4 w-4 mr-2" />
                          Upload Proof
                        </ObjectUploader>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Online Payment Option */}
              <div className="flex items-start space-x-3 p-4 border rounded-lg hover:bg-muted/50">
                <RadioGroupItem value="online_payment" id="online_payment" className="mt-1" />
                <div className="flex-1">
                  <Label htmlFor="online_payment" className="flex items-center gap-2 cursor-pointer">
                    <CreditCard className="h-4 w-4" />
                    <span className="font-semibold">Online Payment (Card/Instant EFT)</span>
                  </Label>
                  <p className="text-sm text-muted-foreground mt-1">
                    Pay securely using your card or instant EFT. Payment is processed immediately.
                  </p>
                  {paymentMethod === "online_payment" && (
                    <div className="mt-3 p-3 bg-yellow-50 dark:bg-yellow-950/20 rounded border">
                      <p className="text-sm text-yellow-800 dark:text-yellow-200">
                        Payment gateway integration required. This will redirect you to a secure payment page.
                      </p>
                    </div>
                  )}
                </div>
              </div>

              {/* Pay Outside App Option */}
              <div className="flex items-start space-x-3 p-4 border rounded-lg hover:bg-muted/50">
                <RadioGroupItem value="pay_outside_app" id="pay_outside_app" className="mt-1" />
                <div className="flex-1">
                  <Label htmlFor="pay_outside_app" className="flex items-center gap-2 cursor-pointer">
                    <Wallet className="h-4 w-4" />
                    <span className="font-semibold">Pay Outside App</span>
                  </Label>
                  <p className="text-sm text-muted-foreground mt-1">
                    For cash payments, existing credit agreements, or other arrangements. Supplier will confirm payment later.
                  </p>
                </div>
              </div>
            </RadioGroup>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={submitPaymentMutation.isPending || !paymentMethod || (paymentMethod === "bank_transfer" && !paymentProofUrl)}
          >
            {submitPaymentMutation.isPending ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Processing...
              </>
            ) : (
              "Submit Payment"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

