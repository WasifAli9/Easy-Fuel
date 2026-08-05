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
    ? new Date(order.completed_at).toLocaleString("en-ZA", {
        year: "numeric",
        month: "long",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : order.created_at
      ? new Date(order.created_at).toLocaleString("en-ZA", {
          year: "numeric",
          month: "long",
          day: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        })
      : "-";
  const total = formatMoneyFromCents(order.total_price_cents || 0);
  const sigUri = resolveDepotReceiptSignatureUri(getDepotReceiptDeliverySignature(order));
  const driverName = getDepotReceiptDriverName(order);
  const receiptNo = order.id.slice(0, 8).toUpperCase();
  const litres = order.litres ?? "-";
  const generated = new Date().toLocaleDateString("en-ZA", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return `
    <html>
      <head>
        <meta charset="utf-8" />
        <style>
          body { font-family: "Segoe UI", Calibri, Arial, sans-serif; color: #0f172a; margin: 0; padding: 0; }
          .bar { height: 6px; background: #0d9488; }
          .wrap { padding: 36px 40px 40px; }
          .muted { color: #64748b; font-size: 10px; letter-spacing: 0.14em; text-transform: uppercase; font-weight: 600; }
          .rule { border-bottom: 1px solid #cbd5e1; }
          table { width: 100%; border-collapse: collapse; margin-top: 8px; }
          th { background: #0f172a; color: #fff; font-size: 10px; letter-spacing: 0.12em; text-transform: uppercase; padding: 10px 12px; text-align: left; }
          th.r, td.r { text-align: right; }
          td { padding: 14px 12px; border-bottom: 1px solid #e2e8f0; font-size: 13px; }
          .total { margin-left: auto; width: 260px; margin-top: 0; }
          .total-row { display: flex; justify-content: space-between; padding: 8px 12px; font-size: 13px; color: #475569; border-bottom: 1px solid #e2e8f0; }
          .total-due { display: flex; justify-content: space-between; padding: 12px; border-top: 2px solid #0f172a; background: #f8fafc; font-weight: 700; font-size: 16px; }
          .sig { border-bottom: 1px solid #94a3b8; height: 88px; display: flex; align-items: flex-end; justify-content: center; }
          .sig img { max-height: 80px; max-width: 100%; object-fit: contain; }
          .footer { margin-top: 48px; padding-top: 16px; border-top: 1px solid #e2e8f0; text-align: center; color: #94a3b8; font-size: 11px; line-height: 1.5; }
        </style>
      </head>
      <body>
        <div class="bar"></div>
        <div class="wrap">
          <div style="display:flex;justify-content:space-between;gap:24px;padding-bottom:20px;" class="rule">
            <div>
              <div style="font-size:22px;font-weight:600;">EasyFuel</div>
              <div class="muted" style="margin-top:4px;">Official depot collection receipt</div>
            </div>
            <div style="text-align:right;">
              <div class="muted">Receipt no.</div>
              <div style="font-family:ui-monospace,monospace;font-size:16px;font-weight:600;margin-top:4px;">#${receiptNo}</div>
            </div>
          </div>

          <div style="display:flex;gap:40px;margin-top:28px;">
            <div style="flex:1;">
              <div class="muted rule" style="padding-bottom:6px;">Collected by (driver)</div>
              <div style="margin-top:10px;font-size:15px;font-weight:600;">${driverName || "—"}</div>
            </div>
            <div style="flex:1;">
              <div class="muted rule" style="padding-bottom:6px;">Issued by (depot)</div>
              <div style="margin-top:10px;font-size:15px;font-weight:600;">${order.depots?.name || "—"}</div>
            </div>
          </div>

          <div style="margin-top:28px;border:1px solid #e2e8f0;background:#f8fafc;padding:12px 16px;">
            <div class="muted">Completed</div>
            <div style="margin-top:4px;font-size:13px;font-weight:500;">${completedAt}</div>
          </div>

          <div style="margin-top:28px;">
            <div class="muted">Collection details</div>
            <table>
              <thead>
                <tr>
                  <th>Description</th>
                  <th class="r">Qty</th>
                  <th class="r">Amount</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>
                    <div style="font-weight:600;">${fuelLabel}</div>
                    <div style="font-size:11px;color:#64748b;margin-top:2px;">Depot fuel collection</div>
                  </td>
                  <td class="r">${litres} L</td>
                  <td class="r" style="font-weight:600;">${total}</td>
                </tr>
              </tbody>
            </table>
            <div class="total">
              <div class="total-row"><span>Subtotal</span><span>${total}</span></div>
              <div class="total-due"><span style="font-size:12px;letter-spacing:0.1em;text-transform:uppercase;">Total due</span><span>${total}</span></div>
            </div>
          </div>

          ${
            sigUri
              ? `<div style="margin-top:40px;">
                  <div class="muted rule" style="padding-bottom:6px;margin-bottom:16px;">Authorised signatures</div>
                  <div class="sig"><img src="${sigUri}" /></div>
                  <div style="margin-top:8px;font-size:11px;font-weight:500;">${driverName || "Driver"}</div>
                  <div class="muted" style="margin-top:2px;">Receipt confirmation</div>
                </div>`
              : ""
          }

          <div class="footer">
            This document is an official record of fuel collected via EasyFuel. Retain for your records.<br/>
            Generated ${generated}
          </div>
        </div>
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
