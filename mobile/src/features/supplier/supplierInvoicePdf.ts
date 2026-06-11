import { apiClient } from "@/services/api/client";
import {
  downloadAndShareDepotReceiptPdf,
  type DepotOrderReceiptFields,
} from "@/features/depot/depotOrderReceipt";

function mapSupplierInvoiceToReceipt(order: Record<string, unknown>): DepotOrderReceiptFields {
  const depot = (order.depot ?? order.depots) as DepotOrderReceiptFields["depots"];
  const fuelType = (order.fuelType ?? order.fuel_types) as DepotOrderReceiptFields["fuel_types"];
  const driver = (order.driver ?? order.drivers) as DepotOrderReceiptFields["drivers"];

  return {
    id: String(order.id ?? ""),
    litres: (order.litres as number | string | null) ?? null,
    total_price_cents: Number(order.totalCents ?? order.total_price_cents ?? 0),
    completed_at: (order.completedAt ?? order.completed_at) as string | null,
    created_at: (order.createdAt ?? order.created_at) as string | null,
    depots: depot,
    fuel_types: fuelType,
    drivers: driver,
    delivery_signature_url: (order.deliverySignatureUrl ??
      order.delivery_signature_url) as string | null,
  };
}

/** Download receipt PDF on-device (matches driver depot receipt). */
export async function downloadAndShareSupplierInvoicePdf(
  orderOrId: DepotOrderReceiptFields | string,
): Promise<void> {
  if (typeof orderOrId !== "string") {
    return downloadAndShareDepotReceiptPdf(orderOrId);
  }

  const { data } = await apiClient.get<Record<string, unknown>>(`/api/supplier/invoices/${orderOrId}`);
  return downloadAndShareDepotReceiptPdf(mapSupplierInvoiceToReceipt(data));
}
