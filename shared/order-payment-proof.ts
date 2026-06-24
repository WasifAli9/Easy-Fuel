/** Fields on customer orders after Ozow payment (snake_case API + camelCase drizzle). */
export type OrderPaymentOrderFields = {
  paid_at?: string | Date | null;
  paidAt?: string | Date | null;
  total_cents?: number | null;
  totalCents?: number | null;
  state?: string | null;
};

export type OrderPaymentProof = {
  paidAt: string | null;
  amountCents: number | null;
  hasProof: boolean;
};

export function getOrderPaymentFromOrder(
  order: OrderPaymentOrderFields | null | undefined,
): OrderPaymentProof {
  const paidAtRaw = order?.paid_at ?? order?.paidAt ?? null;
  const paidAt =
    paidAtRaw instanceof Date
      ? paidAtRaw.toISOString()
      : paidAtRaw
        ? String(paidAtRaw)
        : null;

  const amountRaw = order?.total_cents ?? order?.totalCents ?? null;
  const amountCents = amountRaw != null ? Number(amountRaw) : null;

  const hasProof = Boolean(paidAt && amountCents != null && amountCents > 0);

  return { paidAt, amountCents, hasProof };
}

export function formatOrderPaidAt(
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

export function formatOrderPaymentAmount(
  amountCents: number | null | undefined,
  locale = "en-ZA",
): string | null {
  if (amountCents == null || Number.isNaN(amountCents)) return null;
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: "ZAR",
  }).format(amountCents / 100);
}
