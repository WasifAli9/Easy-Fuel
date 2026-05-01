export type AnyDocument = Record<string, any>;

export function normalizeDocument<T extends AnyDocument>(doc: T) {
  return {
    ...doc,
    id: doc.id,
    doc_type: doc.doc_type ?? doc.docType ?? "",
    title: doc.title ?? "",
    file_path: doc.file_path ?? doc.filePath ?? "",
    verification_status: doc.verification_status ?? doc.verificationStatus ?? "pending",
    expiry_date: doc.expiry_date ?? doc.expiryDate ?? null,
    created_at: doc.created_at ?? doc.createdAt ?? null,
  };
}

export function normalizeDocuments<T extends AnyDocument>(docs: T[] | undefined | null) {
  return (docs ?? []).map((d) => normalizeDocument(d));
}
