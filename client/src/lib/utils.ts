import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// Currency mapping for African countries
const currencyLocaleMap: Record<string, string> = {
  'ZAR': 'en-ZA',  // South Africa - Rand
  'USD': 'en-US',  // US Dollar
  'EUR': 'en-EU',  // Euro
  'KES': 'en-KE',  // Kenya - Shilling
  'NGN': 'en-NG',  // Nigeria - Naira
  'GHS': 'en-GH',  // Ghana - Cedi
  'TZS': 'en-TZ',  // Tanzania - Shilling
  'UGX': 'en-UG',  // Uganda - Shilling
  'EGP': 'ar-EG',  // Egypt - Pound
  'MAD': 'ar-MA',  // Morocco - Dirham
};

export function formatCurrency(amount: number, currencyCode: string = 'ZAR'): string {
  const locale = currencyLocaleMap[currencyCode] || 'en-ZA';
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: currencyCode,
    minimumFractionDigits: 2,
  }).format(amount);
}
