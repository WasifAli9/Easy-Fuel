import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";

interface UserProfile {
  currency: string;
}

/**
 * Hook to fetch and access the logged-in user's preferred currency
 * Defaults to 'ZAR' (South African Rand) if not set or user not logged in
 */
export function useCurrency() {
  const { user } = useAuth();
  
  const { data: profile } = useQuery<UserProfile>({
    queryKey: ["/api/profile"],
    enabled: !!user,
  });
  
  const currency = profile?.currency || 'ZAR';
  
  // Get currency symbol for display (without formatCurrency overhead)
  const getCurrencySymbol = (currencyCode: string = currency): string => {
    const symbols: Record<string, string> = {
      'ZAR': 'R',
      'USD': '$',
      'EUR': '€',
      'GBP': '£',
      'KES': 'KSh',
      'NGN': '₦',
      'GHS': 'GH₵',
      'TZS': 'TSh',
      'UGX': 'USh',
      'EGP': 'E£',
      'MAD': 'د.م.',
      'BWP': 'P',
      'MUR': '₨',
      'ZMW': 'ZK',
    };
    return symbols[currencyCode] || currencyCode;
  };
  
  return {
    currency,
    currencySymbol: getCurrencySymbol(currency),
    getCurrencySymbol,
  };
}
