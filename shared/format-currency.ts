/** Display amounts as 50,000.00 (comma thousands, dot decimals) across web and mobile. */

export const CURRENCY_SYMBOLS: Record<string, string> = {
  ZAR: "R",
  USD: "$",
  EUR: "€",
  GBP: "£",
  KES: "KSh",
  NGN: "₦",
  GHS: "GH₵",
  TZS: "TSh",
  UGX: "USh",
  EGP: "E£",
  MAD: "د.م.",
  BWP: "P",
  MUR: "₨",
  ZMW: "ZK",
};

export type FormatMoneyOptions = {
  currencyCode?: string;
  /** Override symbol (e.g. from useCurrency hook). */
  symbol?: string;
  minimumFractionDigits?: number;
  maximumFractionDigits?: number;
};

/**
 * Format a major-unit amount: `R 50,000.00`
 */
export function formatMoneyAmount(amount: number, options: FormatMoneyOptions = {}): string {
  const currencyCode = options.currencyCode ?? "ZAR";
  const symbol = options.symbol ?? CURRENCY_SYMBOLS[currencyCode] ?? currencyCode;
  const minimumFractionDigits = options.minimumFractionDigits ?? 2;
  const maximumFractionDigits = options.maximumFractionDigits ?? 2;

  const numberPart = new Intl.NumberFormat("en-US", {
    minimumFractionDigits,
    maximumFractionDigits,
  }).format(amount);

  return `${symbol} ${numberPart}`;
}

/** Format cents as major currency: `R 50,000.00` */
export function formatMoneyFromCents(cents: number, options: FormatMoneyOptions = {}): string {
  return formatMoneyAmount(cents / 100, options);
}

/** Number only (no symbol): `50,000.00` */
export function formatDecimalAmount(
  amount: number,
  minimumFractionDigits = 2,
  maximumFractionDigits = 2,
): string {
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits,
    maximumFractionDigits,
  }).format(amount);
}
