import { useRef, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Download, Loader2 } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { useCurrency } from "@/hooks/use-currency";
import { apiRequest } from "@/lib/queryClient";
import jsPDF from "jspdf";
import html2canvas from "html2canvas";

interface DriverDepotOrderReceiptProps {
  order: any;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function DriverDepotOrderReceipt({ order, open, onOpenChange }: DriverDepotOrderReceiptProps) {
  const { currency } = useCurrency();
  const receiptRef = useRef<HTMLDivElement>(null);
  const [isGeneratingPDF, setIsGeneratingPDF] = useState(false);
  const [logoLoaded, setLogoLoaded] = useState(false);
  const [deliverySignatureUrl, setDeliverySignatureUrl] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      // Preload logo - try multiple possible paths
      const img = new Image();
      const logoSrc = "/logo-easyfuel.png";
      img.src = logoSrc;
      img.onload = () => {
        setLogoLoaded(true);
      };
      img.onerror = () => {
        // Try alternative logo paths
        const img2 = new Image();
        img2.src = "/logo.png";
        img2.onload = () => {
          setLogoLoaded(true);
        };
        img2.onerror = () => {
          // Try icon as fallback
          const img3 = new Image();
          img3.src = "/icon-192.png";
          img3.onload = () => {
            setLogoLoaded(true);
          };
          img3.onerror = () => {
            // Keep logoLoaded as false to show EF fallback
            setLogoLoaded(false);
          };
        };
      };
      
      // Fetch presigned URL for delivery signature if it exists
      if (order?.delivery_signature_url) {
        const fetchPresignedUrl = async () => {
          try {
            let objectPath = order.delivery_signature_url;
            
            // If already a full URL, use it directly
            if (objectPath.startsWith('http://') || objectPath.startsWith('https://')) {
              setDeliverySignatureUrl(objectPath);
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
            
            const response = await apiRequest("POST", "/api/objects/presigned-url", { objectPath });
            const responseData = await response.json();
            if (responseData.signedUrl) {
              setDeliverySignatureUrl(responseData.signedUrl);
            } else {
              // Fallback to direct endpoint
              setDeliverySignatureUrl(`/api/objects/${objectPath}`);
            }
          } catch (error) {
            console.error("Error fetching presigned URL for delivery signature:", error);
            // Fallback to direct endpoint
            setDeliverySignatureUrl(order.delivery_signature_url.startsWith('/') 
              ? order.delivery_signature_url 
              : `/api/objects/${order.delivery_signature_url}`);
          }
        };
        
        fetchPresignedUrl();
      } else {
        setDeliverySignatureUrl(null);
      }
    }
  }, [open, order?.delivery_signature_url]);

  const formatDate = (dateString: string) => {
    if (!dateString) return "N/A";
    const date = new Date(dateString);
    return date.toLocaleDateString("en-ZA", {
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const handleDownloadPDF = async () => {
    if (!receiptRef.current) return;

    setIsGeneratingPDF(true);
    try {
      const canvas = await html2canvas(receiptRef.current, {
        scale: 2,
        backgroundColor: "#ffffff",
        useCORS: true,
        logging: false,
      });

      const imgData = canvas.toDataURL("image/png");
      const pdf = new jsPDF("p", "mm", "a4");
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = pdf.internal.pageSize.getHeight();
      const imgWidth = canvas.width;
      const imgHeight = canvas.height;
      const ratio = Math.min(pdfWidth / imgWidth, pdfHeight / imgHeight);
      const imgScaledWidth = imgWidth * ratio;
      const imgScaledHeight = imgHeight * ratio;
      const xOffset = (pdfWidth - imgScaledWidth) / 2;
      const yOffset = (pdfHeight - imgScaledHeight) / 2;

      pdf.addImage(imgData, "PNG", xOffset, yOffset, imgScaledWidth, imgScaledHeight);
      
      const orderId = order.id.slice(0, 8).toUpperCase();
      pdf.save(`EasyFuel-Receipt-${orderId}.pdf`);
    } catch (error) {
      console.error("Error generating PDF:", error);
    } finally {
      setIsGeneratingPDF(false);
    }
  };

  if (!order) return null;

  // Get driver name - check multiple possible paths
  const driverName = order.drivers?.profile?.full_name 
    || order.driver_profile?.full_name 
    || order.drivers?.full_name
    || "Unknown Driver";
  
  // Get supplier name - check multiple possible paths
  const supplierName = order.depots?.suppliers?.name 
    || order.depots?.suppliers?.registered_name 
    || order.supplier?.name
    || order.supplier?.registered_name
    || "Unknown Supplier";
  const depotName = order.depots?.name || "Unknown Depot";
  const fuelType = order.fuel_types?.label || "Unknown";
  const litres = order.actual_litres || order.litres || 0;
  const pricePerLitre = order.price_per_litre_cents / 100;
  const totalPrice = order.total_price_cents / 100;
  const orderDate = formatDate(order.created_at);
  const completedDate = order.completed_at ? formatDate(order.completed_at) : formatDate(order.updated_at);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Order Receipt</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {/* Receipt Content */}
          <div
            ref={receiptRef}
            className="bg-white p-8 rounded-lg border-2 border-primary/20 shadow-lg"
            style={{ minHeight: "800px" }}
          >
            {/* Header */}
            <div className="flex items-center justify-between mb-8 pb-6 border-b-2 border-primary/30">
              <div className="flex items-center gap-4">
                <div className="h-16 w-16 rounded-lg flex items-center justify-center shadow-md" style={{ backgroundColor: "#0ce6db" }}>
                  {logoLoaded ? (
                    <img 
                      src="/logo-easyfuel.png" 
                      alt="Easy Fuel Logo" 
                      className="h-full w-full object-contain p-2"
                      onError={(e) => {
                        // Try alternative logo paths
                        const target = e.target as HTMLImageElement;
                        const currentSrc = target.src;
                        if (!currentSrc.includes("/logo.png")) {
                          target.src = "/logo.png";
                        } else if (!currentSrc.includes("/icon-192.png")) {
                          target.src = "/icon-192.png";
                        } else {
                          setLogoLoaded(false);
                        }
                      }}
                    />
                  ) : (
                    <span className="text-2xl font-bold text-white">EF</span>
                  )}
                </div>
                <div>
                  <h1 className="text-3xl font-bold text-primary" style={{ color: "#0ce6db" }}>
                    Easy Fuel
                  </h1>
                  <p className="text-sm text-muted-foreground">Fuel Delivery Receipt</p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-sm text-muted-foreground">Order ID</p>
                <p className="text-lg font-bold">#{order.id.slice(0, 8).toUpperCase()}</p>
              </div>
            </div>

            {/* Order Information */}
            <div className="space-y-6 mb-8">
              <div className="grid grid-cols-2 gap-6">
                <div>
                  <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                    Driver Information
                  </h3>
                  <div className="bg-muted/30 rounded-lg p-4">
                    <p className="font-semibold text-lg">{driverName}</p>
                    {order.drivers?.profile?.phone && (
                      <p className="text-sm text-muted-foreground mt-1">{order.drivers.profile.phone}</p>
                    )}
                  </div>
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                    Depot Information
                  </h3>
                  <div className="bg-muted/30 rounded-lg p-4">
                    <p className="font-semibold text-lg">{depotName}</p>
                    {order.depots?.suppliers?.name && (
                      <p className="text-sm text-muted-foreground mt-1">Supplier: {order.depots.suppliers.name || order.depots.suppliers.registered_name}</p>
                    )}
                  </div>
                </div>
              </div>

              <div>
                <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                  Depot Address
                </h3>
                <div className="bg-muted/30 rounded-lg p-4">
                  {order.depots?.address_street ? (
                    <p className="text-sm text-muted-foreground">
                      {[
                        order.depots.address_street,
                        order.depots.address_city,
                        order.depots.address_province,
                        order.depots.address_postal_code,
                      ]
                        .filter(Boolean)
                        .join(", ")}
                    </p>
                  ) : (
                    <p className="text-sm text-muted-foreground">Address not available</p>
                  )}
                </div>
              </div>
            </div>

            {/* Fuel Details */}
            <div className="mb-8">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-4">
                Fuel Collection Details
              </h3>
              <div className="bg-gradient-to-r from-primary/10 to-primary/5 rounded-lg p-6 border border-primary/20">
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <p className="text-sm text-muted-foreground">Fuel Type</p>
                    <p className="text-xl font-bold mt-1">{fuelType}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Quantity</p>
                    <p className="text-xl font-bold mt-1">{litres}L</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Price per Litre</p>
                    <p className="text-xl font-bold mt-1">{formatCurrency(pricePerLitre, currency)}</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Pricing Breakdown */}
            <div className="mb-8">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-4">
                Pricing Breakdown
              </h3>
              <div className="border rounded-lg overflow-hidden">
                <div className="bg-muted/30 p-4 flex justify-between items-center">
                  <span className="font-medium">Subtotal ({litres}L × {formatCurrency(pricePerLitre, currency)})</span>
                  <span className="font-semibold">{formatCurrency(totalPrice, currency)}</span>
                </div>
                <div className="bg-primary/5 p-4 flex justify-between items-center border-t">
                  <span className="text-lg font-bold">Total Amount</span>
                  <span className="text-2xl font-bold" style={{ color: "#0ce6db" }}>
                    {formatCurrency(totalPrice, currency)}
                  </span>
                </div>
              </div>
            </div>

            {/* Dates */}
            <div className="grid grid-cols-2 gap-6 mb-8">
              <div>
                <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                  Order Date
                </h3>
                <p className="text-lg">{orderDate}</p>
              </div>
              <div>
                <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                  Completed Date
                </h3>
                <p className="text-lg">{completedDate}</p>
              </div>
            </div>

            {/* Signatures */}
            <div className="mt-8 pt-6 border-t-2 border-primary/30">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-4">
                Signatures
              </h3>
              <div className="grid grid-cols-3 gap-4">
                {order.driver_signature_url && (
                  <div className="text-center">
                    <p className="text-xs text-muted-foreground mb-2">Driver Signature</p>
                    <div className="bg-muted/30 rounded-lg p-3 border border-border">
                      <img
                        src={order.driver_signature_url}
                        alt="Driver Signature"
                        className="max-h-24 mx-auto object-contain"
                        onError={(e) => {
                          (e.target as HTMLImageElement).style.display = "none";
                        }}
                      />
                    </div>
                    <p className="text-xs font-medium mt-2">{driverName}</p>
                  </div>
                )}
                {order.supplier_signature_url && (
                  <div className="text-center">
                    <p className="text-xs text-muted-foreground mb-2">Supplier Signature</p>
                    <div className="bg-muted/30 rounded-lg p-3 border border-border">
                      <img
                        src={order.supplier_signature_url}
                        alt="Supplier Signature"
                        className="max-h-24 mx-auto object-contain"
                        onError={(e) => {
                          (e.target as HTMLImageElement).style.display = "none";
                        }}
                      />
                    </div>
                    <p className="text-xs font-medium mt-2">{supplierName}</p>
                  </div>
                )}
                {deliverySignatureUrl && (
                  <div className="text-center">
                    <p className="text-xs text-muted-foreground mb-2">Driver Receipt Confirmation</p>
                    <div className="bg-muted/30 rounded-lg p-3 border border-border">
                      <img
                        src={deliverySignatureUrl}
                        alt="Driver Receipt Signature"
                        className="max-h-24 mx-auto object-contain"
                        onError={(e) => {
                          (e.target as HTMLImageElement).style.display = "none";
                        }}
                      />
                    </div>
                    <p className="text-xs font-medium mt-2">{driverName}</p>
                  </div>
                )}
              </div>
            </div>

            {/* Footer */}
            <div className="mt-8 pt-6 border-t border-muted text-center">
              <p className="text-xs text-muted-foreground">
                This is an official receipt from Easy Fuel. Please keep this document for your records.
              </p>
              <p className="text-xs text-muted-foreground mt-2">
                Generated on {new Date().toLocaleDateString("en-ZA", { year: "numeric", month: "long", day: "numeric" })}
              </p>
            </div>
          </div>

          {/* Download Button */}
          <div className="flex justify-end">
            <Button onClick={handleDownloadPDF} disabled={isGeneratingPDF} className="gap-2">
              {isGeneratingPDF ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Generating PDF...
                </>
              ) : (
                <>
                  <Download className="h-4 w-4" />
                  Download PDF
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

