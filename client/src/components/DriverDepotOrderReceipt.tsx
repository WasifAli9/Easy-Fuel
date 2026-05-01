import { useRef, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Download, Loader2 } from "lucide-react";
import { formatCurrency, normalizeFilePath } from "@/lib/utils";
import { useCurrency } from "@/hooks/use-currency";
import jsPDF from "jspdf";
import html2canvas from "html2canvas";

interface DriverDepotOrderReceiptProps {
  order: any;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Digital signatures: `data:image/...;base64,...` renders directly.
 * Legacy uploads: authenticated image proxy (session cookie).
 */
function signatureDisplaySrc(
  orderId: string | undefined,
  kind: "delivery" | "driver" | "supplier",
  raw: string | null | undefined
): string | null {
  if (!raw || !String(raw).trim()) return null;
  const s = String(raw).trim();
  if (s.startsWith("data:image/")) return s;
  if (!orderId) return null;
  return `/api/driver-depot-orders/${orderId}/signature-image?kind=${kind}`;
}

function getSignatureCandidates(
  orderId: string | undefined,
  kind: "delivery" | "driver" | "supplier",
  raw: string | null | undefined
): string[] {
  if (!raw || !String(raw).trim()) return [];
  const s = String(raw).trim();
  if (s.startsWith("data:")) return [s];
  if (s.startsWith("http://") || s.startsWith("https://")) return [s];

  const candidates: string[] = [];
  const proxy = signatureDisplaySrc(orderId, kind, s);
  if (proxy) candidates.push(proxy);

  const normalized = normalizeFilePath(s);
  if (normalized && !candidates.includes(normalized)) {
    candidates.push(normalized);
  }
  return candidates;
}

export function DriverDepotOrderReceipt({ order, open, onOpenChange }: DriverDepotOrderReceiptProps) {
  const { currency } = useCurrency();
  const receiptRef = useRef<HTMLDivElement>(null);
  const [isGeneratingPDF, setIsGeneratingPDF] = useState(false);
  const [logoLoaded, setLogoLoaded] = useState(false);

  const deliverySigRaw =
    order?.delivery_signature_url ?? order?.deliverySignatureUrl ?? null;
  const driverSigRaw =
    order?.driver_signature_url ?? order?.driverSignatureUrl ?? null;
  const supplierSigRaw =
    order?.supplier_signature_url ?? order?.supplierSignatureUrl ?? null;

  const deliverySigCandidates = getSignatureCandidates(order?.id, "delivery", deliverySigRaw);
  const driverSigCandidates = getSignatureCandidates(order?.id, "driver", driverSigRaw);
  const supplierSigCandidates = getSignatureCandidates(order?.id, "supplier", supplierSigRaw);

  const [deliverySigIndex, setDeliverySigIndex] = useState(0);
  const [driverSigIndex, setDriverSigIndex] = useState(0);
  const [supplierSigIndex, setSupplierSigIndex] = useState(0);

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
    }
  }, [open]);

  useEffect(() => {
    if (open) {
      setDeliverySigIndex(0);
      setDriverSigIndex(0);
      setSupplierSigIndex(0);
    }
  }, [open, order?.id, deliverySigRaw, driverSigRaw, supplierSigRaw]);

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

  // Get driver name - check multiple possible paths (snake/camel from API normalization)
  const driverName =
    order.drivers?.profile?.full_name ??
    order.drivers?.profile?.fullName ??
    order.driver_profile?.full_name ??
    order.driverProfile?.fullName ??
    order.drivers?.full_name ??
    "Unknown Driver";
  
  // Get supplier name - check multiple possible paths
  const supplierName = order.depots?.suppliers?.name 
    || order.depots?.suppliers?.registered_name 
    || order.supplier?.name
    || order.supplier?.registered_name
    || "Unknown Supplier";
  const depotName = order.depots?.name || "Unknown Depot";
  const fuelType =
    order.fuel_types?.label || order.fuelTypes?.label || order.fuel_types?.code || "Unknown";
  const litres =
    order.actual_litres_delivered ??
    order.actualLitresDelivered ??
    order.actual_litres ??
    order.litres ??
    0;
  const pricePerLitre =
    (order.price_per_litre_cents ?? order.pricePerLitreCents ?? 0) / 100;
  const totalPrice = (order.total_price_cents ?? order.totalPriceCents ?? 0) / 100;
  const orderDate = formatDate(order.created_at);
  const completedDate = order.completed_at ? formatDate(order.completed_at) : formatDate(order.updated_at);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto bg-card text-card-foreground">
        <DialogHeader>
          <DialogTitle>Order Receipt</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {/* Receipt: fixed light “document” palette so dark mode UI does not leak low-contrast theme tokens onto white */}
          <div
            ref={receiptRef}
            className="rounded-lg border-2 border-slate-300 bg-white p-8 text-slate-900 shadow-lg"
            style={{ minHeight: "800px" }}
          >
            {/* Header */}
            <div className="mb-8 flex items-center justify-between border-b-2 border-slate-300 pb-6">
              <div className="flex items-center gap-4">
                <div className="h-16 w-16 rounded-lg flex items-center justify-center border border-slate-200 bg-white">
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
                  <h1 className="text-3xl font-bold text-slate-900">
                    Easy Fuel
                  </h1>
                  <p className="text-sm text-slate-600">Fuel Delivery Receipt</p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-sm text-slate-600">Order ID</p>
                <p className="text-lg font-bold text-slate-900">#{order.id.slice(0, 8).toUpperCase()}</p>
              </div>
            </div>

            {/* Order Information */}
            <div className="mb-8 space-y-6">
              <div className="grid grid-cols-2 gap-6">
                <div>
                  <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-600">
                    Driver Information
                  </h3>
                  <div className="rounded-lg border border-slate-200 bg-slate-100 p-4">
                    <p className="text-lg font-semibold text-slate-900">{driverName}</p>
                    {order.drivers?.profile?.phone && (
                      <p className="mt-1 text-sm text-slate-600">{order.drivers.profile.phone}</p>
                    )}
                  </div>
                </div>
                <div>
                  <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-600">
                    Depot Information
                  </h3>
                  <div className="rounded-lg border border-slate-200 bg-slate-100 p-4">
                    <p className="text-lg font-semibold text-slate-900">{depotName}</p>
                    {order.depots?.suppliers?.name && (
                      <p className="mt-1 text-sm text-slate-600">Supplier: {order.depots.suppliers.name || order.depots.suppliers.registered_name}</p>
                    )}
                  </div>
                </div>
              </div>

              <div>
                <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-600">
                  Depot Address
                </h3>
                <div className="rounded-lg border border-slate-200 bg-slate-100 p-4">
                  {order.depots?.address_street ? (
                    <p className="text-sm text-slate-800">
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
                    <p className="text-sm text-slate-600">Address not available</p>
                  )}
                </div>
              </div>
            </div>

            {/* Fuel Details */}
            <div className="mb-8">
              <h3 className="mb-4 text-sm font-semibold uppercase tracking-wide text-slate-600">
                Fuel Collection Details
              </h3>
              <div className="rounded-lg border border-slate-300 bg-slate-50 p-6">
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <p className="text-sm text-slate-600">Fuel Type</p>
                    <p className="mt-1 text-xl font-bold text-slate-900">{fuelType}</p>
                  </div>
                  <div>
                    <p className="text-sm text-slate-600">Quantity</p>
                    <p className="mt-1 text-xl font-bold text-slate-900">{litres}L</p>
                  </div>
                  <div>
                    <p className="text-sm text-slate-600">Price per Litre</p>
                    <p className="mt-1 text-xl font-bold text-slate-900">{formatCurrency(pricePerLitre, currency)}</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Pricing Breakdown */}
            <div className="mb-8">
              <h3 className="mb-4 text-sm font-semibold uppercase tracking-wide text-slate-600">
                Pricing Breakdown
              </h3>
              <div className="overflow-hidden rounded-lg border border-slate-200">
                <div className="flex items-center justify-between bg-slate-100 p-4">
                  <span className="font-medium text-slate-800">Subtotal ({litres}L × {formatCurrency(pricePerLitre, currency)})</span>
                  <span className="font-semibold text-slate-900">{formatCurrency(totalPrice, currency)}</span>
                </div>
                <div className="flex items-center justify-between border-t border-slate-200 bg-slate-100 p-4">
                  <span className="text-lg font-bold text-slate-900">Total Amount</span>
                  <span className="text-2xl font-bold text-slate-900">
                    {formatCurrency(totalPrice, currency)}
                  </span>
                </div>
              </div>
            </div>

            {/* Dates */}
            <div className="mb-8 grid grid-cols-2 gap-6">
              <div>
                <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-600">
                  Order Date
                </h3>
                <p className="text-lg text-slate-900">{orderDate}</p>
              </div>
              <div>
                <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-600">
                  Completed Date
                </h3>
                <p className="text-lg text-slate-900">{completedDate}</p>
              </div>
            </div>

            {/* Signatures */}
            <div className="mt-8 border-t-2 border-slate-300 pt-6">
              <h3 className="mb-4 text-sm font-semibold uppercase tracking-wide text-slate-600">
                Signatures
              </h3>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                {driverSigCandidates[driverSigIndex] && (
                  <div className="text-center">
                    <p className="mb-2 text-xs text-slate-600">Driver Signature</p>
                    <div className="rounded-lg border border-slate-200 bg-slate-100 p-3">
                      <img
                        src={driverSigCandidates[driverSigIndex]}
                        alt="Driver Signature"
                        className="mx-auto max-h-32 object-contain"
                        onError={() => {
                          if (driverSigIndex + 1 < driverSigCandidates.length) {
                            setDriverSigIndex((i) => i + 1);
                          }
                        }}
                      />
                    </div>
                    <p className="mt-2 text-xs font-medium text-slate-800">{driverName}</p>
                  </div>
                )}
                {supplierSigCandidates[supplierSigIndex] && (
                  <div className="text-center">
                    <p className="mb-2 text-xs text-slate-600">Supplier Signature</p>
                    <div className="rounded-lg border border-slate-200 bg-slate-100 p-3">
                      <img
                        src={supplierSigCandidates[supplierSigIndex]}
                        alt="Supplier Signature"
                        className="mx-auto max-h-32 object-contain"
                        onError={() => {
                          if (supplierSigIndex + 1 < supplierSigCandidates.length) {
                            setSupplierSigIndex((i) => i + 1);
                          }
                        }}
                      />
                    </div>
                    <p className="mt-2 text-xs font-medium text-slate-800">{supplierName}</p>
                  </div>
                )}
                {deliverySigCandidates[deliverySigIndex] && (
                  <div className="text-center">
                    <p className="mb-2 text-xs text-slate-600">Driver Receipt Confirmation</p>
                    <div className="rounded-lg border border-slate-200 bg-slate-100 p-3">
                      <img
                        key={`${order?.id ?? "receipt"}-${deliverySigCandidates[deliverySigIndex]}`}
                        src={deliverySigCandidates[deliverySigIndex]}
                        alt="Driver Receipt Signature"
                        className="mx-auto max-h-32 object-contain"
                        onError={() => {
                          if (deliverySigIndex + 1 < deliverySigCandidates.length) {
                            setDeliverySigIndex((i) => i + 1);
                          }
                        }}
                      />
                    </div>
                    <p className="mt-2 text-xs font-medium text-slate-800">{driverName}</p>
                  </div>
                )}
              </div>
            </div>

            {/* Footer */}
            <div className="mt-8 border-t border-slate-200 pt-6 text-center">
              <p className="text-xs text-slate-600">
                This is an official receipt from Easy Fuel. Please keep this document for your records.
              </p>
              <p className="text-xs text-slate-600 mt-2">
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

