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
  const formatted = new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: currencyCode,
    minimumFractionDigits: 2,
  }).format(amount);
  
  // Replace comma decimal separator with dot for consistency
  // This ensures all prices use dots (.) instead of commas (,) for decimals
  // For 'en-ZA' locale, comma is used as decimal separator (e.g., "R 100,00")
  // We replace the last comma (which is always the decimal separator) with a dot
  const lastCommaIndex = formatted.lastIndexOf(',');
  if (lastCommaIndex !== -1) {
    // Check if comma is followed by 2 digits (decimal separator pattern)
    const afterComma = formatted.substring(lastCommaIndex + 1);
    if (/^\d{2}/.test(afterComma)) {
      return formatted.substring(0, lastCommaIndex) + '.' + afterComma;
    }
  }
  return formatted;
}

/**
 * Normalizes a file path to work with the /objects/ endpoint
 * Handles different path formats:
 * - Full URLs: http://localhost:5002/api/storage/upload/private-objects/uploads/...
 * - Paths with /api/storage/upload/: /api/storage/upload/private-objects/uploads/...
 * - Bucket/path format: private-objects/uploads/...
 * - Already normalized: /objects/private-objects/uploads/...
 * 
 * @param filePath - The file path to normalize
 * @returns Normalized path for use with /objects/ endpoint
 */
export function normalizeFilePath(filePath: string | null | undefined): string | null {
  if (!filePath || filePath.trim() === '') {
    return null;
  }

  // If it's already a full URL starting with /objects/, use it as-is
  if (filePath.startsWith('/objects/')) {
    return filePath;
  }

  // If it's a full HTTP/HTTPS URL, extract the path
  if (filePath.startsWith('http://') || filePath.startsWith('https://')) {
    try {
      const url = new URL(filePath);
      // Extract path after domain
      let path = url.pathname;
      
      // Remove /api/storage/upload/ prefix if present
      if (path.startsWith('/api/storage/upload/')) {
        path = path.replace('/api/storage/upload/', '');
      }
      
      // If path doesn't start with /objects/, prepend it
      if (!path.startsWith('/objects/')) {
        // Remove leading slash if present (we'll add /objects/ prefix)
        path = path.startsWith('/') ? path.slice(1) : path;
        return `/objects/${path}`;
      }
      
      return path;
    } catch (e) {
      // If URL parsing fails, treat as relative path
      console.warn('Failed to parse file path as URL:', filePath);
    }
  }

  // If it starts with /api/storage/upload/, remove that prefix
  if (filePath.startsWith('/api/storage/upload/')) {
    const path = filePath.replace('/api/storage/upload/', '');
    return `/objects/${path}`;
  }

  // If it's already a relative path (bucket/path format), prepend /objects/
  // Remove leading slash if present
  const cleanPath = filePath.startsWith('/') ? filePath.slice(1) : filePath;
  return `/objects/${cleanPath}`;
}
