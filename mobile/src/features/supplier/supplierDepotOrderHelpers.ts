import { getFuelPortalTokens } from "@/design/fuel-portal-tokens";
import { lightTheme } from "@/design/theme";
import { formatDepotOrderStatus } from "@/lib/format-labels";

export type SupplierDepotOrder = {
  id: string;
  status: string;
  payment_status?: string;
  payment_method?: string;
  payment_proof_url?: string | null;
  litres?: number;
  total_price_cents?: number;
  created_at?: string;
  updated_at?: string;
  completed_at?: string;
  delivery_signature_url?: string | null;
  deliverySignatureUrl?: string | null;
  driver_signature_url?: string | null;
  supplier_signature_url?: string | null;
  depots?: { name?: string };
  fuel_types?: { label?: string };
  drivers?: { profile?: { full_name?: string; fullName?: string } };
};

export function getDriverDisplayName(order: SupplierDepotOrder) {
  return (
    order.drivers?.profile?.full_name ||
    order.drivers?.profile?.fullName ||
    "—"
  );
}

export function fuelIconName(label: string) {
  const l = label.toLowerCase();
  if (l.includes("adblue")) return "water-outline" as const;
  return "gas-station-outline" as const;
}

export function formatOrderStatusLabel(order: SupplierDepotOrder) {
  return formatDepotOrderStatus(order);
}

export function statusBadgeStyle(
  status: string,
  t: ReturnType<typeof getFuelPortalTokens>,
  theme: typeof lightTheme,
) {
  if (status === "completed") {
    return { bg: t.accentPositive, fg: "#FFFFFF" };
  }
  if (status === "pending" || status === "ready_for_pickup") {
    return { bg: t.badgeActiveTint, fg: t.badgeActiveText };
  }
  if (status === "rejected" || status === "cancelled") {
    return { bg: "rgba(148, 163, 184, 0.4)", fg: theme.colors.onSurface };
  }
  return { bg: "rgba(100,116,139,0.22)", fg: theme.colors.onSurface };
}

export function mutationErrorMessage(error: unknown) {
  const e = error as { response?: { data?: { error?: string } }; message?: string };
  return e.response?.data?.error || e.message || "Something went wrong.";
}
