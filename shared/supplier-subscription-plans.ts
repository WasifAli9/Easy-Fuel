/**
 * Supplier subscription plan definitions – source of truth for Standard vs Enterprise.
 * Used by server (platform listing, analytics, settlements, invoicing) and client (subscription page, dashboard).
 */

export type SupplierPlanCode = "standard" | "enterprise";

export type SupplierDriverAccess = "full_network" | "full_network_priority";
export type SupplierAnalyticsLevel = "standard" | "advanced_api";
export type SupplierSettlementSpeed = "next_day" | "same_day";

export interface SupplierSubscriptionPlan {
  code: SupplierPlanCode;
  name: string;
  /** R500 for Standard; null for Enterprise (custom pricing) */
  priceCents: number | null;
  priceZAR: number | null;
  isCustomPricing: boolean;
  platformListing: boolean;
  /** standard = single view; enterprise = multi-branch */
  orderManagementDashboard: boolean;
  orderManagementMultiBranch: boolean;
  driverAccess: SupplierDriverAccess;
  analyticsLevel: SupplierAnalyticsLevel;
  invoicing: boolean;
  invoicingCustomTemplates: boolean;
  settlementSpeed: SupplierSettlementSpeed;
  accountManager: boolean;
}

export const SUPPLIER_SUBSCRIPTION_PLANS: Record<SupplierPlanCode, SupplierSubscriptionPlan> = {
  standard: {
    code: "standard",
    name: "Standard",
    priceCents: 50000, // R500
    priceZAR: 500,
    isCustomPricing: false,
    platformListing: true,
    orderManagementDashboard: true,
    orderManagementMultiBranch: false,
    driverAccess: "full_network",
    analyticsLevel: "standard",
    invoicing: true,
    invoicingCustomTemplates: false,
    settlementSpeed: "next_day",
    accountManager: false,
  },
  enterprise: {
    code: "enterprise",
    name: "Enterprise",
    priceCents: null,
    priceZAR: null,
    isCustomPricing: true,
    platformListing: true,
    orderManagementDashboard: true,
    orderManagementMultiBranch: true,
    driverAccess: "full_network_priority",
    analyticsLevel: "advanced_api",
    invoicing: true,
    invoicingCustomTemplates: true,
    settlementSpeed: "same_day",
    accountManager: true,
  },
};

export const SUPPLIER_PLAN_CODES: SupplierPlanCode[] = ["standard", "enterprise"];

export function getSupplierPlan(code: string): SupplierSubscriptionPlan | null {
  if (SUPPLIER_SUBSCRIPTION_PLANS[code as SupplierPlanCode]) return SUPPLIER_SUBSCRIPTION_PLANS[code as SupplierPlanCode];
  return null;
}
