/**
 * Driver subscription service: resolve active subscription, tier, and feature access.
 * Radius limits are read from app_settings (admin-editable) with code defaults as fallback.
 */

import { supabaseAdmin } from "./supabase";
import {
  getPlan,
  RADIUS_MILES,
  type PlanCode,
  type SubscriptionPlan,
  type RadiusTier,
} from "@shared/subscription-plans";

export interface ActiveSubscriptionResult {
  subscriptionId: string;
  driverId: string;
  planCode: PlanCode;
  plan: SubscriptionPlan;
  status: string;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  nextBillingAt: string | null;
}

/**
 * Get the active subscription for a driver (status = active and current_period_end >= today).
 */
export async function getDriverActiveSubscription(
  driverId: string
): Promise<ActiveSubscriptionResult | null> {
  const today = new Date().toISOString().split("T")[0];
  const { data: sub, error } = await supabaseAdmin
    .from("driver_subscriptions")
    .select("id, driver_id, plan_code, status, current_period_start, current_period_end, next_billing_at")
    .eq("driver_id", driverId)
    .eq("status", "active")
    .gte("current_period_end", today)
    .order("current_period_end", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !sub) return null;
  const plan = getPlan(sub.plan_code);
  if (!plan) return null;

  return {
    subscriptionId: sub.id,
    driverId: sub.driver_id,
    planCode: sub.plan_code as PlanCode,
    plan,
    status: sub.status,
    currentPeriodStart: sub.current_period_start,
    currentPeriodEnd: sub.current_period_end,
    nextBillingAt: sub.next_billing_at,
  };
}

/**
 * Get current subscription for a driver (any status) for display; prefers active.
 */
export async function getDriverSubscription(driverId: string): Promise<{
  subscription: ActiveSubscriptionResult | null;
  latestRow: { id: string; plan_code: string; status: string; next_billing_at: string | null; current_period_start: string | null; current_period_end: string | null } | null;
} | null> {
  const active = await getDriverActiveSubscription(driverId);
  if (active)
    return { subscription: active, latestRow: { id: active.subscriptionId, plan_code: active.planCode, status: active.status, next_billing_at: active.nextBillingAt, current_period_start: active.currentPeriodStart, current_period_end: active.currentPeriodEnd } };

  const { data: row } = await supabaseAdmin
    .from("driver_subscriptions")
    .select("id, plan_code, status, next_billing_at, current_period_start, current_period_end")
    .eq("driver_id", driverId)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!row) return { subscription: null, latestRow: null };
  const plan = getPlan(row.plan_code);
  return {
    subscription: null,
    latestRow: {
      id: row.id,
      plan_code: row.plan_code,
      status: row.status,
      next_billing_at: row.next_billing_at,
      current_period_start: row.current_period_start,
      current_period_end: row.current_period_end,
    },
  };
}

/** Get radius limits from app_settings (admin-editable); fallback to RADIUS_MILES if columns missing. */
export async function getSubscriptionRadiusMiles(): Promise<Record<RadiusTier, number>> {
  const { data: row } = await supabaseAdmin
    .from("app_settings")
    .select("driver_radius_standard_miles, driver_radius_extended_miles, driver_radius_unlimited_miles")
    .eq("id", 1)
    .maybeSingle();

  return {
    standard: row?.driver_radius_standard_miles ?? RADIUS_MILES.standard,
    extended: row?.driver_radius_extended_miles ?? RADIUS_MILES.extended,
    unlimited: row?.driver_radius_unlimited_miles ?? RADIUS_MILES.unlimited,
  };
}

/**
 * Get max radius in miles for a driver (from active subscription tier + app_settings), or 0 if no subscription.
 */
export async function getDriverMaxRadiusMiles(driverId: string): Promise<number> {
  const active = await getDriverActiveSubscription(driverId);
  if (!active) return 0;
  const limits = await getSubscriptionRadiusMiles();
  const tier = active.plan.deliveryRadius as RadiusTier;
  return limits[tier] ?? RADIUS_MILES[tier];
}

/**
 * Check if driver has active subscription (for middleware / gating).
 */
export async function driverHasActiveSubscription(driverId: string): Promise<boolean> {
  const active = await getDriverActiveSubscription(driverId);
  return !!active;
}
