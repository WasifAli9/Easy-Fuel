/** Fields returned on orders after delivery completion (snake_case API + camelCase drizzle). */
export type DeliverySignatureOrderFields = {
  delivery_signature_data?: string | null;
  deliverySignatureData?: string | null;
  delivery_signature_name?: string | null;
  deliverySignatureName?: string | null;
  delivery_signed_at?: string | Date | null;
  deliverySignedAt?: string | Date | null;
  delivered_at?: string | Date | null;
  deliveredAt?: string | Date | null;
};

export type DeliverySignatureProof = {
  signatureData: string | null;
  signatureName: string | null;
  signedAt: string | null;
  imageUri: string | null;
  hasProof: boolean;
};

export function getDeliverySignatureFromOrder(
  order: DeliverySignatureOrderFields | null | undefined,
): DeliverySignatureProof {
  const signatureData =
    order?.delivery_signature_data ?? order?.deliverySignatureData ?? null;
  const signatureName = (
    order?.delivery_signature_name ?? order?.deliverySignatureName ?? ""
  ).trim() || null;

  const signedAtRaw =
    order?.delivery_signed_at ??
    order?.deliverySignedAt ??
    order?.delivered_at ??
    order?.deliveredAt ??
    null;

  const signedAt =
    signedAtRaw instanceof Date
      ? signedAtRaw.toISOString()
      : signedAtRaw
        ? String(signedAtRaw)
        : null;

  const trimmed = signatureData?.trim() ?? "";
  const imageUri = trimmed.startsWith("data:image/") ? trimmed : null;

  const hasProof = Boolean(imageUri || signatureName || signedAt);

  return {
    signatureData: trimmed || null,
    signatureName,
    signedAt,
    imageUri,
    hasProof,
  };
}

export function formatDeliverySignedAt(
  iso: string | null | undefined,
  locale = "en-ZA",
): string | null {
  if (!iso) return null;
  try {
    return new Date(iso).toLocaleString(locale, {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: "Africa/Johannesburg",
    });
  } catch {
    return null;
  }
}
