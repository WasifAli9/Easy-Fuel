/**
 * Driver subscription plan definitions – source of truth for tiers and features.
 * Used by server (dispatch, API, feature gating) and client (subscription page, dashboard).
 */

export type PlanCode = "starter" | "professional" | "premium";

export type NotificationLevel = "standard" | "priority" | "priority_alerts";
export type RadiusTier = "standard" | "extended" | "unlimited";
export type DashboardLevel = "basic" | "advanced" | "advanced_export";
export type SupportLevel = "none" | "email" | "phone_email";

export interface SubscriptionPlan {
  code: PlanCode;
  name: string;
  priceCents: number;
  priceZAR: number;
  /** Order notifications: standard | priority | priority_alerts */
  orderNotifications: NotificationLevel;
  /** Delivery radius tier; mapped to max miles in dispatch */
  deliveryRadius: RadiusTier;
  /** Earnings dashboard: basic | advanced | advanced_export */
  earningsDashboard: DashboardLevel;
  /** Customer ratings boost in dispatch (Premium only) */
  ratingsBoost: boolean;
  /** Dedicated support (display only) */
  support: SupportLevel;
}

/** Default max radius in miles per tier (fallback when app_settings not used) */
export const RADIUS_MILES: Record<RadiusTier, number> = {
  standard: 200,
  extended: 500,
  unlimited: 999,
};

export const SUBSCRIPTION_PLANS: Record<PlanCode, SubscriptionPlan> = {
  starter: {
    code: "starter",
    name: "Starter",
    priceCents: 9900, // R99
    priceZAR: 99,
    orderNotifications: "standard",
    deliveryRadius: "standard",
    earningsDashboard: "basic",
    ratingsBoost: false,
    support: "none",
  },
  professional: {
    code: "professional",
    name: "Professional",
    priceCents: 20000, // R200
    priceZAR: 200,
    orderNotifications: "priority",
    deliveryRadius: "extended",
    earningsDashboard: "advanced",
    ratingsBoost: false,
    support: "email",
  },
  premium: {
    code: "premium",
    name: "Premium",
    priceCents: 29900, // R299
    priceZAR: 299,
    orderNotifications: "priority_alerts",
    deliveryRadius: "unlimited",
    earningsDashboard: "advanced_export",
    ratingsBoost: true,
    support: "phone_email",
  },
};

export const PLAN_CODES: PlanCode[] = ["starter", "professional", "premium"];

export function getPlan(code: string): SubscriptionPlan | null {
  if (SUBSCRIPTION_PLANS[code as PlanCode]) return SUBSCRIPTION_PLANS[code as PlanCode];
  return null;
}

export function getMaxRadiusMiles(radiusTier: RadiusTier): number {
  return RADIUS_MILES[radiusTier] ?? RADIUS_MILES.standard;
}
