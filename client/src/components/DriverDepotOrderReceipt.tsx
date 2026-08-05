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

  const depotAddress = [
    order.depots?.address_street,
    order.depots?.address_city,
    order.depots?.address_province,
    order.depots?.address_postal_code,
  ]
    .filter(Boolean)
    .join(", ");

  const driverPhone =
    order.drivers?.profile?.phone ??
    order.driver_profile?.phone ??
    order.drivers?.phone ??
    null;

  const hasAnySignature =
    Boolean(driverSigCandidates[driverSigIndex]) ||
    Boolean(supplierSigCandidates[supplierSigIndex]) ||
    Boolean(deliverySigCandidates[deliverySigIndex]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[92vh] overflow-y-auto bg-card text-card-foreground">
        <DialogHeader>
          <DialogTitle>Official receipt</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {/* Formal print document — light palette independent of app theme */}
          <div
            ref={receiptRef}
            className="mx-auto w-full max-w-[720px] bg-white text-slate-900 shadow-md"
            style={{
              fontFamily: '"Segoe UI", Calibri, "Helvetica Neue", Arial, sans-serif',
              minHeight: "900px",
            }}
          >
            {/* Brand accent bar */}
            <div className="h-1.5 w-full bg-[#0d9488]" />

            <div className="px-10 py-9">
              {/* Letterhead */}
              <div className="flex items-start justify-between gap-6 border-b border-slate-300 pb-6">
                <div className="flex items-start gap-3">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden border border-slate-200 bg-white">
                    {logoLoaded ? (
                      <img
                        src="/logo-easyfuel.png"
                        alt="EasyFuel"
                        className="h-full w-full object-contain p-1.5"
                        onError={(e) => {
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
                      <span className="text-sm font-bold tracking-tight text-[#0d9488]">EF</span>
                    )}
                  </div>
                  <div>
                    <h1 className="text-[22px] font-semibold tracking-tight text-slate-900">
                      EasyFuel
                    </h1>
                    <p className="mt-0.5 text-[11px] font-medium uppercase tracking-[0.14em] text-slate-500">
                      Official depot collection receipt
                    </p>
                    <p className="mt-2 text-[11px] leading-relaxed text-slate-500">
                      portal.easyfuel.ai
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                    Receipt no.
                  </p>
                  <p className="mt-1 font-mono text-base font-semibold tracking-wide text-slate-900">
                    #{order.id.slice(0, 8).toUpperCase()}
                  </p>
                  <p className="mt-3 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                    Status
                  </p>
                  <p className="mt-1 text-sm font-medium capitalize text-slate-800">
                    {(order.status || "completed").replace(/_/g, " ")}
                  </p>
                </div>
              </div>

              {/* Parties */}
              <div className="mt-7 grid grid-cols-2 gap-x-10 gap-y-6">
                <div>
                  <p className="border-b border-slate-200 pb-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                    Collected by (driver)
                  </p>
                  <p className="mt-2.5 text-[15px] font-semibold text-slate-900">{driverName}</p>
                  {driverPhone ? (
                    <p className="mt-1 text-[12px] text-slate-600">{driverPhone}</p>
                  ) : null}
                </div>
                <div>
                  <p className="border-b border-slate-200 pb-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                    Issued by (depot)
                  </p>
                  <p className="mt-2.5 text-[15px] font-semibold text-slate-900">{depotName}</p>
                  {supplierName && supplierName !== "Unknown Supplier" ? (
                    <p className="mt-1 text-[12px] text-slate-600">{supplierName}</p>
                  ) : null}
                </div>
                <div className="col-span-2">
                  <p className="border-b border-slate-200 pb-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                    Depot address
                  </p>
                  <p className="mt-2.5 text-[13px] leading-relaxed text-slate-700">
                    {depotAddress || "Address not recorded"}
                  </p>
                </div>
              </div>

              {/* Dates */}
              <div className="mt-7 grid grid-cols-2 gap-x-10 border border-slate-200 bg-slate-50/80 px-4 py-3">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                    Order placed
                  </p>
                  <p className="mt-1 text-[13px] font-medium text-slate-800">{orderDate}</p>
                </div>
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                    Completed
                  </p>
                  <p className="mt-1 text-[13px] font-medium text-slate-800">{completedDate}</p>
                </div>
              </div>

              {/* Line items table */}
              <div className="mt-8">
                <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                  Collection details
                </p>
                <table className="w-full border-collapse text-left text-[13px]">
                  <thead>
                    <tr className="border-y-2 border-slate-800 bg-slate-800 text-white">
                      <th className="px-3 py-2.5 text-[10px] font-semibold uppercase tracking-[0.12em]">
                        Description
                      </th>
                      <th className="px-3 py-2.5 text-right text-[10px] font-semibold uppercase tracking-[0.12em]">
                        Qty
                      </th>
                      <th className="px-3 py-2.5 text-right text-[10px] font-semibold uppercase tracking-[0.12em]">
                        Unit price
                      </th>
                      <th className="px-3 py-2.5 text-right text-[10px] font-semibold uppercase tracking-[0.12em]">
                        Amount
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="border-b border-slate-200">
                      <td className="px-3 py-3.5 align-top">
                        <p className="font-semibold text-slate-900">{fuelType}</p>
                        <p className="mt-0.5 text-[11px] text-slate-500">Depot fuel collection</p>
                      </td>
                      <td className="px-3 py-3.5 text-right tabular-nums text-slate-800">
                        {Number(litres).toLocaleString("en-ZA")} L
                      </td>
                      <td className="px-3 py-3.5 text-right tabular-nums text-slate-800">
                        {formatCurrency(pricePerLitre, currency)}
                      </td>
                      <td className="px-3 py-3.5 text-right tabular-nums font-medium text-slate-900">
                        {formatCurrency(totalPrice, currency)}
                      </td>
                    </tr>
                  </tbody>
                </table>

                <div className="mt-0 ml-auto w-full max-w-[280px] border-b border-slate-200">
                  <div className="flex items-center justify-between px-3 py-2 text-[13px] text-slate-600">
                    <span>Subtotal</span>
                    <span className="tabular-nums">{formatCurrency(totalPrice, currency)}</span>
                  </div>
                  <div className="flex items-center justify-between border-t-2 border-slate-800 bg-slate-50 px-3 py-3">
                    <span className="text-[12px] font-semibold uppercase tracking-[0.1em] text-slate-800">
                      Total due
                    </span>
                    <span className="text-lg font-bold tabular-nums text-slate-900">
                      {formatCurrency(totalPrice, currency)}
                    </span>
                  </div>
                </div>
              </div>

              {/* Signatures */}
              {hasAnySignature ? (
                <div className="mt-10">
                  <p className="mb-4 border-b border-slate-200 pb-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                    Authorised signatures
                  </p>
                  <div className="grid grid-cols-1 gap-8 sm:grid-cols-3">
                    {driverSigCandidates[driverSigIndex] ? (
                      <div>
                        <div className="flex h-24 items-end justify-center border-b border-slate-400 pb-1">
                          <img
                            src={driverSigCandidates[driverSigIndex]}
                            alt="Driver signature"
                            className="max-h-20 max-w-full object-contain"
                            onError={() => {
                              if (driverSigIndex + 1 < driverSigCandidates.length) {
                                setDriverSigIndex((i) => i + 1);
                              }
                            }}
                          />
                        </div>
                        <p className="mt-2 text-[11px] font-medium text-slate-800">{driverName}</p>
                        <p className="text-[10px] uppercase tracking-[0.12em] text-slate-500">
                          Driver
                        </p>
                      </div>
                    ) : null}
                    {supplierSigCandidates[supplierSigIndex] ? (
                      <div>
                        <div className="flex h-24 items-end justify-center border-b border-slate-400 pb-1">
                          <img
                            src={supplierSigCandidates[supplierSigIndex]}
                            alt="Supplier signature"
                            className="max-h-20 max-w-full object-contain"
                            onError={() => {
                              if (supplierSigIndex + 1 < supplierSigCandidates.length) {
                                setSupplierSigIndex((i) => i + 1);
                              }
                            }}
                          />
                        </div>
                        <p className="mt-2 text-[11px] font-medium text-slate-800">{supplierName}</p>
                        <p className="text-[10px] uppercase tracking-[0.12em] text-slate-500">
                          Supplier
                        </p>
                      </div>
                    ) : null}
                    {deliverySigCandidates[deliverySigIndex] ? (
                      <div>
                        <div className="flex h-24 items-end justify-center border-b border-slate-400 pb-1">
                          <img
                            key={`${order?.id ?? "receipt"}-${deliverySigCandidates[deliverySigIndex]}`}
                            src={deliverySigCandidates[deliverySigIndex]}
                            alt="Receipt confirmation signature"
                            className="max-h-20 max-w-full object-contain"
                            onError={() => {
                              if (deliverySigIndex + 1 < deliverySigCandidates.length) {
                                setDeliverySigIndex((i) => i + 1);
                              }
                            }}
                          />
                        </div>
                        <p className="mt-2 text-[11px] font-medium text-slate-800">{driverName}</p>
                        <p className="text-[10px] uppercase tracking-[0.12em] text-slate-500">
                          Receipt confirmation
                        </p>
                      </div>
                    ) : null}
                  </div>
                </div>
              ) : null}

              {/* Footer */}
              <div className="mt-12 border-t border-slate-200 pt-5 text-center">
                <p className="text-[11px] leading-relaxed text-slate-500">
                  This document is an official record of fuel collected from the named depot via EasyFuel.
                  Retain for your records. Payment and fulfilment are confirmed independently of this printout.
                </p>
                <p className="mt-2 text-[10px] text-slate-400">
                  Generated {new Date().toLocaleDateString("en-ZA", {
                    year: "numeric",
                    month: "long",
                    day: "numeric",
                  })}
                </p>
              </div>
            </div>
          </div>

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

