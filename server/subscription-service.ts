/**
 * Driver subscription service: resolve active subscription, tier, and feature access.
 * Radius limits are read from app_settings (admin-editable) with code defaults as fallback.
 */

import { db } from "./db";
import {
  getPlan,
  RADIUS_MILES,
  type PlanCode,
  type SubscriptionPlan,
  type RadiusTier,
} from "@shared/subscription-plans";
import { appSettings, driverSubscriptions } from "@shared/schema";
import { and, desc, eq, gte } from "drizzle-orm";

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
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const rows = await db
    .select()
    .from(driverSubscriptions)
    .where(
      and(
        eq(driverSubscriptions.driverId, driverId),
        eq(driverSubscriptions.status, "active"),
        gte(driverSubscriptions.currentPeriodEnd, today),
      ),
    )
    .orderBy(desc(driverSubscriptions.currentPeriodEnd))
    .limit(1);
  const sub = rows[0];
  if (!sub) return null;
  const plan = getPlan(sub.planCode);
  if (!plan) return null;

  return {
    subscriptionId: sub.id,
    driverId: sub.driverId,
    planCode: sub.planCode as PlanCode,
    plan,
    status: sub.status,
    currentPeriodStart: sub.currentPeriodStart ? sub.currentPeriodStart.toISOString() : null,
    currentPeriodEnd: sub.currentPeriodEnd ? sub.currentPeriodEnd.toISOString() : null,
    nextBillingAt: sub.nextBillingAt ? sub.nextBillingAt.toISOString() : null,
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

  const rows = await db
    .select({
      id: driverSubscriptions.id,
      plan_code: driverSubscriptions.planCode,
      status: driverSubscriptions.status,
      next_billing_at: driverSubscriptions.nextBillingAt,
      current_period_start: driverSubscriptions.currentPeriodStart,
      current_period_end: driverSubscriptions.currentPeriodEnd,
    })
    .from(driverSubscriptions)
    .where(eq(driverSubscriptions.driverId, driverId))
    .orderBy(desc(driverSubscriptions.updatedAt))
    .limit(1);
  const row = rows[0];

  if (!row) return { subscription: null, latestRow: null };
  const plan = getPlan(row.plan_code);
  return {
    subscription: null,
    latestRow: {
      id: row.id,
      plan_code: row.plan_code,
      status: row.status,
      next_billing_at: row.next_billing_at ? row.next_billing_at.toISOString() : null,
      current_period_start: row.current_period_start ? row.current_period_start.toISOString() : null,
      current_period_end: row.current_period_end ? row.current_period_end.toISOString() : null,
    },
  };
}

/** Get radius limits from app_settings (admin-editable); fallback to RADIUS_MILES if columns missing. */
export async function getSubscriptionRadiusMiles(): Promise<Record<RadiusTier, number>> {
  const rows = await db
    .select({
      driverRadiusStandardMiles: appSettings.driverRadiusStandardMiles,
      driverRadiusExtendedMiles: appSettings.driverRadiusExtendedMiles,
      driverRadiusUnlimitedMiles: appSettings.driverRadiusUnlimitedMiles,
    })
    .from(appSettings)
    .where(eq(appSettings.id, 1))
    .limit(1);
  const row = rows[0];

  return {
    standard: row?.driverRadiusStandardMiles ?? RADIUS_MILES.standard,
    extended: row?.driverRadiusExtendedMiles ?? RADIUS_MILES.extended,
    unlimited: row?.driverRadiusUnlimitedMiles ?? RADIUS_MILES.unlimited,
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
