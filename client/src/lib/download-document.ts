import { documentObjectUrl } from "@/lib/utils";

export type DownloadDocumentMeta = {
  title?: string;
  mime_type?: string | null;
  mimeType?: string | null;
};

function filenameFromDisposition(header: string | null): string | undefined {
  if (!header) return undefined;
  const star = header.match(/filename\*=UTF-8''([^;]+)/i);
  if (star?.[1]) {
    try {
      return decodeURIComponent(star[1].trim());
    } catch {
      /* ignore */
    }
  }
  const plain = header.match(/filename="([^"]+)"/i);
  return plain?.[1]?.trim();
}

function buildFallbackFilename(meta?: DownloadDocumentMeta): string {
  const title = (meta?.title || "document").replace(/[/\\?%*:|"<>]/g, "-").trim() || "document";
  if (/\.\w{2,5}$/i.test(title)) return title;
  const mime = (meta?.mime_type ?? meta?.mimeType ?? "application/pdf").toLowerCase().split(";")[0].trim();
  if (mime === "application/pdf") return `${title}.pdf`;
  return title;
}

/**
 * Download a stored compliance document to the user's device (no new browser tab).
 */
export async function downloadStoredDocument(
  filePath: string | null | undefined,
  meta?: DownloadDocumentMeta,
): Promise<void> {
  const viewUrl = documentObjectUrl(filePath, meta);
  if (!viewUrl) {
    throw new Error("Document file path is missing or invalid");
  }

  const url = new URL(viewUrl, window.location.origin);
  url.searchParams.set("download", "true");

  const response = await fetch(url.toString(), { credentials: "include" });
  if (!response.ok) {
    let detail = `Download failed (${response.status})`;
    try {
      const body = (await response.json()) as { error?: string };
      if (body?.error) detail = body.error;
    } catch {
      /* not JSON */
    }
    throw new Error(detail);
  }

  const blob = await response.blob();
  if (!blob.size) {
    throw new Error("Document file is empty");
  }

  const filename =
    filenameFromDisposition(response.headers.get("Content-Disposition")) || buildFallbackFilename(meta);

  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = objectUrl;
  anchor.download = filename;
  anchor.rel = "noopener";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(objectUrl);
}
