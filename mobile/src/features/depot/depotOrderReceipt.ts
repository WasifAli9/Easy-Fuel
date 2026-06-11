import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import { formatMoneyFromCents } from "@/lib/format-currency";
import { appConfig } from "@/services/config";

export type DepotOrderReceiptFields = {
  id: string;
  litres?: number | string | null;
  total_price_cents?: number;
  completed_at?: string | null;
  created_at?: string | null;
  depots?: { name?: string };
  fuel_types?: { label?: string };
  fuelTypes?: { label?: string };
  drivers?: { profile?: { full_name?: string; fullName?: string } };
  delivery_signature_url?: string | null;
  deliverySignatureUrl?: string | null;
  driver_signature_url?: string | null;
  driverSignatureUrl?: string | null;
};

export function resolveDepotReceiptSignatureUri(raw?: string | null): string {
  if (!raw?.trim()) return "";
  if (raw.startsWith("data:") || raw.startsWith("http://") || raw.startsWith("https://")) {
    return raw;
  }
  const normalized = raw.startsWith("/") ? raw : `/objects/${raw}`;
  return `${appConfig.apiBaseUrl.replace(/\/$/, "")}${normalized}`;
}

export function getDepotReceiptDeliverySignature(order: DepotOrderReceiptFields): string {
  return order.delivery_signature_url ?? order.deliverySignatureUrl ?? "";
}

export function getDepotReceiptDriverName(order: DepotOrderReceiptFields): string {
  return (
    order.drivers?.profile?.full_name ||
    order.drivers?.profile?.fullName ||
    ""
  );
}

export function getDepotReceiptFuelLabel(order: DepotOrderReceiptFields): string {
  return order.fuel_types?.label || order.fuelTypes?.label || "-";
}

export function buildDepotReceiptHtml(order: DepotOrderReceiptFields): string {
  const fuelLabel = getDepotReceiptFuelLabel(order);
  const completedAt = order.completed_at
    ? new Date(order.completed_at).toLocaleString("en-ZA")
    : order.created_at
      ? new Date(order.created_at).toLocaleString("en-ZA")
      : "-";
  const total = formatMoneyFromCents(order.total_price_cents || 0);
  const sigUri = resolveDepotReceiptSignatureUri(getDepotReceiptDeliverySignature(order));
  const driverName = getDepotReceiptDriverName(order);

  return `
    <html>
      <body style="font-family: Arial, sans-serif; padding: 20px; color: #111827;">
        <h1 style="color:#14b8a6; margin-bottom: 4px;">Easy Fuel</h1>
        <p style="margin-top:0; color:#6b7280;">Fuel Collection Receipt</p>
        <hr />
        <p><strong>Order ID:</strong> #${order.id.slice(-8).toUpperCase()}</p>
        <p><strong>Depot:</strong> ${order.depots?.name || "-"}</p>
        ${driverName ? `<p><strong>Driver:</strong> ${driverName}</p>` : ""}
        <p><strong>Fuel:</strong> ${fuelLabel}</p>
        <p><strong>Litres:</strong> ${order.litres ?? "-"}</p>
        <p><strong>Completed:</strong> ${completedAt}</p>
        <p style="font-size:18px;"><strong>Total Amount:</strong> ${total}</p>
        ${
          sigUri
            ? `<p><strong>Driver Receipt Signature:</strong></p><img src="${sigUri}" style="max-width: 100%; height: 120px; object-fit: contain; border:1px solid #d1d5db; border-radius:6px;" />`
            : ""
        }
      </body>
    </html>
  `;
}

/** Generate PDF on-device (same approach as driver depot receipt — avoids broken server PDF / axios binary issues). */
export async function downloadAndShareDepotReceiptPdf(order: DepotOrderReceiptFields): Promise<void> {
  const html = buildDepotReceiptHtml(order);
  const { uri } = await Print.printToFileAsync({ html });

  const canShare = await Sharing.isAvailableAsync();
  if (!canShare) {
    throw new Error("Sharing is not available on this device.");
  }

  await Sharing.shareAsync(uri, {
    mimeType: "application/pdf",
    dialogTitle: "Download Receipt",
    UTI: "com.adobe.pdf",
  });
}
