export const COMPLIANCE_DOCUMENT_MIME = "application/pdf" as const;

export function isCompliancePdfUpload(mimeType: unknown, filePath?: unknown): boolean {
  const mime = String(mimeType ?? "")
    .toLowerCase()
    .split(";")[0]
    .trim();
  if (mime === COMPLIANCE_DOCUMENT_MIME) return true;
  if (!mime || mime === "application/octet-stream") {
    const path = String(filePath ?? "").toLowerCase();
    return path.endsWith(".pdf");
  }
  return false;
}

export function compliancePdfOnlyError(): string {
  return "Compliance documents must be PDF files (application/pdf).";
}

export function complianceDocumentDownloadMeta<T extends { mime_type?: string | null; mimeType?: string | null }>(
  doc?: T,
): T | undefined {
  if (!doc) return doc;
  return { ...doc, mime_type: COMPLIANCE_DOCUMENT_MIME, mimeType: COMPLIANCE_DOCUMENT_MIME };
}
