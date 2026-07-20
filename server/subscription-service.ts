/**
 * Driver pickup radius (single platform-wide value, admin-editable).
 * No subscription tiers. Default 500 miles, configurable from the admin portal
 * via app_settings.driver_pickup_radius_miles.
 */

import { RADIUS_MILES, type RadiusTier } from "@shared/subscription-plans";

/** Fallback driver pickup radius in miles when the setting is unavailable. */
export const DRIVER_MAX_RADIUS_MILES = 500;

/**
 * Reads the admin-configured pickup radius from app_settings.
 * Falls back to DRIVER_MAX_RADIUS_MILES if the column/row is missing.
 */
async function getConfiguredRadiusMiles(): Promise<number> {
  try {
    const { pool } = await import("./db");
    const result = await pool.query(
      "SELECT driver_pickup_radius_miles FROM app_settings WHERE id = 1 LIMIT 1",
    );
    const raw = result.rows?.[0]?.driver_pickup_radius_miles;
    const miles = typeof raw === "number" ? raw : parseInt(raw, 10);
    if (Number.isFinite(miles) && miles > 0) return miles;
  } catch {
    // Column may not exist yet, or DB unavailable — use fallback.
  }
  return DRIVER_MAX_RADIUS_MILES;
}

/** Kept for compatibility: returns the single configured radius for every tier. */
export async function getSubscriptionRadiusMiles(): Promise<Record<RadiusTier, number>> {
  const miles = await getConfiguredRadiusMiles();
  return {
    standard: miles,
    extended: miles,
    unlimited: miles,
  };
}

/** Max pickup radius in miles for a driver (single admin-configured value for everyone). */
export async function getDriverMaxRadiusMiles(_driverId?: string): Promise<number> {
  return getConfiguredRadiusMiles();
}

// Referenced to keep the shared import meaningful if defaults are needed elsewhere.
export const DEFAULT_RADIUS_MILES = RADIUS_MILES;
