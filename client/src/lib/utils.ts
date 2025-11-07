import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// Currency mapping for African countries
const currencyLocaleMap: Record<string, string> = {
  'ZAR': 'en-ZA',  // South Africa - Rand
  'USD': 'en-US',  // US Dollar
  'EUR': 'de-DE',  // Euro (using German locale)
  'GBP': 'en-GB',  // British Pound
  'KES': 'sw-KE',  // Kenya - Shilling
  'NGN': 'en-NG',  // Nigeria - Naira
  'GHS': 'en-GH',  // Ghana - Cedi
  'TZS': 'sw-TZ',  // Tanzania - Shilling
  'UGX': 'en-UG',  // Uganda - Shilling
  'EGP': 'ar-EG',  // Egypt - Pound
  'MAD': 'ar-MA',  // Morocco - Dirham
  'BWP': 'en-BW',  // Botswana - Pula
  'MUR': 'en-MU',  // Mauritius - Rupee
  'ZMW': 'en-ZM',  // Zambia - Kwacha
};

export function formatCurrency(amount: number, currencyCode: string = 'ZAR'): string {
  const locale = currencyLocaleMap[currencyCode] || 'en-ZA';
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: currencyCode,
    minimumFractionDigits: 2,
  }).format(amount);
}
