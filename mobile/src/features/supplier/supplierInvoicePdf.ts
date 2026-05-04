import { File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";
import { apiClient } from "@/services/api/client";

/**
 * `GET /api/supplier/invoices/:id/pdf?download=1` — binary PDF must not pass through JSON/case-alias transforms.
 */
export async function downloadAndShareSupplierInvoicePdf(orderId: string): Promise<void> {
  const response = await apiClient.get<ArrayBuffer>(`/api/supplier/invoices/${orderId}/pdf`, {
    params: { download: 1 },
    responseType: "arraybuffer",
  });

  const raw = response.data as ArrayBuffer | Uint8Array;
  let bytes: Uint8Array;
  if (raw instanceof ArrayBuffer) {
    bytes = new Uint8Array(raw);
  } else if (typeof ArrayBuffer !== "undefined" && ArrayBuffer.isView(raw)) {
    const view = raw as ArrayBufferView;
    bytes = new Uint8Array(view.buffer, view.byteOffset, view.byteLength);
  } else {
    throw new Error("Invalid PDF response from server.");
  }
  if (bytes.byteLength === 0) {
    throw new Error("Empty PDF from server.");
  }

  const short = orderId.replace(/-/g, "").slice(0, 8).toUpperCase();
  const filename = `EasyFuel-Receipt-${short}.pdf`;

  const file = new File(Paths.cache, filename);
  file.create({ overwrite: true });
  file.write(bytes);

  const canShare = await Sharing.isAvailableAsync();
  if (canShare) {
    await Sharing.shareAsync(file.uri, {
      mimeType: "application/pdf",
      dialogTitle: "Receipt PDF",
      UTI: "com.adobe.pdf",
    });
  }
}
