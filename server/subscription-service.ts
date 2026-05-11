/**
 * Driver pickup radius limits from app_settings (admin-editable).
 * All active drivers use the "unlimited" tier cap; no paid subscription is required.
 */

import { db } from "./db";
import { RADIUS_MILES, type RadiusTier } from "@shared/subscription-plans";
import { appSettings } from "@shared/schema";
import { eq } from "drizzle-orm";

/** Radius limits from app_settings (admin-editable); fallback to RADIUS_MILES if columns missing. */
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

/** Max pickup radius in miles for a driver (same cap for everyone: unlimited tier from settings). */
export async function getDriverMaxRadiusMiles(_driverId?: string): Promise<number> {
  const limits = await getSubscriptionRadiusMiles();
  return limits.unlimited;
}
