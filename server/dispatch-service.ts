import { db, pool } from "./db";
import { calculateDistance, milesToKm } from "./utils/distance";
import { websocketService } from "./websocket";
import { offerNotifications } from "./notification-helpers";
import { getSubscriptionRadiusMiles } from "./subscription-service";
import {
  appSettings,
  customers,
  dispatchOffers,
  driverCompanyMemberships,
  driverPricing,
  drivers,
  fuelTypes,
  orders,
} from "@shared/schema";
import { and, eq, inArray, isNotNull, isNull, lt } from "drizzle-orm";

/** Offers stay open until the order is cancelled or the customer accepts a quote (column is NOT NULL). */
export function getOpenDispatchOfferExpiry(): Date {
  return new Date("2099-12-31T23:59:59.000Z");
}

const OPEN_DISPATCH_OFFER_STATES = ["pending_customer", "offered"] as const;

/** Close remaining quotes when the customer cancels the order. */
export async function closeOpenDispatchOffersForOrder(orderId: string): Promise<void> {
  await db
    .update(dispatchOffers)
    .set({ state: "customer_declined", updatedAt: new Date() })
    .where(
      and(
        eq(dispatchOffers.orderId, orderId),
        inArray(dispatchOffers.state, [...OPEN_DISPATCH_OFFER_STATES]),
      ),
    );
}

/** Push updated totals to customers viewing open orders after a driver changes fuel price. */
export async function notifyCustomersDriverPricingChanged(
  driverId: string,
  fuelTypeId: string,
): Promise<void> {
  const rows = await db
    .select({
      orderId: orders.id,
      customerUserId: customers.userId,
    })
    .from(dispatchOffers)
    .innerJoin(orders, eq(orders.id, dispatchOffers.orderId))
    .innerJoin(customers, eq(customers.id, orders.customerId))
    .where(
      and(
        eq(dispatchOffers.driverId, driverId),
        inArray(dispatchOffers.state, [...OPEN_DISPATCH_OFFER_STATES]),
        inArray(orders.state, ["created", "awaiting_payment"]),
        isNull(orders.assignedDriverId),
        eq(orders.fuelTypeId, fuelTypeId),
      ),
    );

  const notifiedOrders = new Set<string>();
  for (const row of rows) {
    if (!row.customerUserId || notifiedOrders.has(row.orderId)) continue;
    notifiedOrders.add(row.orderId);
    websocketService.sendOrderUpdate(row.customerUserId, {
      type: "driver_offer_pricing_updated",
      orderId: row.orderId,
      driverId,
      fuelTypeId,
    });
  }
}

interface CreateDispatchOffersParams {
  orderId: string;
  fuelTypeId: string;
  dropLat: number;
  dropLng: number;
  litres: number;
  maxBudgetCents?: number | null;
  /** Drivers who already have an offer row for this order (refresh skips them). */
  excludeDriverIds?: Set<string>;
}

const OPEN_ORDER_STATES = new Set(["created", "awaiting_payment"]);
const OFFER_REFRESH_THROTTLE_MS = 25_000;
const lastOfferRefreshAt = new Map<string, number>();

/** Re-scan eligible drivers and add offers for any not already on this order. */
export async function refreshDispatchOffersForOrder(orderId: string): Promise<number> {
  const orderRows = await db
    .select({
      id: orders.id,
      state: orders.state,
      assignedDriverId: orders.assignedDriverId,
      fuelTypeId: orders.fuelTypeId,
      dropLat: orders.dropLat,
      dropLng: orders.dropLng,
      litres: orders.litres,
      maxBudgetCents: orders.maxBudgetCents,
    })
    .from(orders)
    .where(eq(orders.id, orderId))
    .limit(1);
  const order = orderRows[0];
  if (!order) return 0;
  if (order.assignedDriverId) return 0;
  if (!OPEN_ORDER_STATES.has(String(order.state))) return 0;

  const dropLat = order.dropLat != null ? Number(order.dropLat) : NaN;
  const dropLng = order.dropLng != null ? Number(order.dropLng) : NaN;
  const litres = Number(order.litres);
  if (!order.fuelTypeId || !Number.isFinite(dropLat) || !Number.isFinite(dropLng) || !Number.isFinite(litres)) {
    return 0;
  }

  const now = Date.now();
  const last = lastOfferRefreshAt.get(orderId) ?? 0;
  if (now - last < OFFER_REFRESH_THROTTLE_MS) {
    return 0;
  }
  lastOfferRefreshAt.set(orderId, now);

  const existingRows = await db
    .select({ driverId: dispatchOffers.driverId })
    .from(dispatchOffers)
    .where(eq(dispatchOffers.orderId, orderId));
  const excludeDriverIds = new Set(existingRows.map((r) => r.driverId));

  return createDispatchOffers({
    orderId,
    fuelTypeId: order.fuelTypeId,
    dropLat,
    dropLng,
    litres,
    maxBudgetCents: order.maxBudgetCents,
    excludeDriverIds,
  });
}

interface DriverWithLocation {
  id: string;
  user_id: string;
  current_lat: number | null;
  current_lng: number | null;
  vehicle_capacity_litres: number | null;
}

/**
 * Creates dispatch offers for an order with automatically calculated pricing
 * Matches drivers based on:
 * 1. Vehicle capacity
 * 2. Proximity (within radius preference)
 * 3. Driver has pricing set for the fuel type
 * 
 * Automatically calculates pricing for each driver:
 * - Fuel cost = driver's price per liter × order litres
 * - Delivery fee = admin-set price per km × distance (driver to customer)
 * - Total = Fuel cost + Delivery fee
 */
/** @returns Number of new dispatch offer rows created */
export async function createDispatchOffers({
  orderId,
  fuelTypeId,
  dropLat,
  dropLng,
  litres,
  maxBudgetCents,
  excludeDriverIds,
}: CreateDispatchOffersParams): Promise<number> {
  try {
    // Get admin-set price per km from app_settings
    const appSettingsRows = await db
      .select({ price_per_km_cents: appSettings.pricePerKmCents })
      .from(appSettings)
      .where(eq(appSettings.id, 1))
      .limit(1);
    const appSettingsRow = appSettingsRows[0];
    const pricePerKmCents = appSettingsRow?.price_per_km_cents || 5000; // Default R50 per km

    // Find all available drivers with location, radius, and capacity
    // IMPORTANT: Only fetch drivers that are active and compliance approved
    const driversRows = await db
      .select({
        id: drivers.id,
        user_id: drivers.userId,
        current_lat: drivers.currentLat,
        current_lng: drivers.currentLng,
        vehicle_capacity_litres: drivers.vehicleCapacityLitres,
        status: drivers.status,
        compliance_status: drivers.complianceStatus,
      })
      .from(drivers)
      .where(and(eq(drivers.status, "active"), eq(drivers.complianceStatus, "approved")));

    if (!driversRows || driversRows.length === 0) {
      return 0;
    }

    let driversWithSub = driversRows as any[];
    if (driversWithSub.length === 0) {
      return 0;
    }

    if (excludeDriverIds?.size) {
      driversWithSub = driversWithSub.filter((d: any) => !excludeDriverIds.has(d.id));
      if (driversWithSub.length === 0) {
        return 0;
      }
    }

    // Company-scoped disable: still linked to a company but disabled by that company → not eligible for platform dispatch
    const companyBlockedRows = await db
      .select({ driver_id: driverCompanyMemberships.driverId })
      .from(driverCompanyMemberships)
      .where(
        and(
          inArray(
            driverCompanyMemberships.driverId,
            driversWithSub.map((d: any) => d.id),
          ),
          eq(driverCompanyMemberships.isDisabledByCompany, true),
          isNotNull(driverCompanyMemberships.companyId),
        ),
      );
    const companyDisabledIds = new Set((companyBlockedRows || []).map((m: any) => m.driver_id));
    const beforeCompany = driversWithSub.length;
    driversWithSub = driversWithSub.filter((d: any) => !companyDisabledIds.has(d.id));
    if (companyDisabledIds.size > 0) {
      console.log(
        `[createDispatchOffers] Order ${orderId}: Excluded ${beforeCompany - driversWithSub.length} driver(s) disabled by fleet company`
      );
    }
    if (driversWithSub.length === 0) {
      console.log(`[createDispatchOffers] Order ${orderId}: No drivers left after company disable filter`);
      return 0;
    }

    // Require active vehicle selected and valid for independent vs fleet context
    const driverIdsForActive = driversWithSub.map((d: any) => d.id);
    const activeRows = await pool.query(
      `SELECT d.id AS driver_id, d.active_vehicle_id,
              v.capacity_litres AS vehicle_capacity_litres, v.company_id AS vehicle_company_id,
              v.vehicle_status,
              COALESCE(m.membership_status::text, 'none') AS membership_status,
              COALESCE(m.work_independent, true) AS work_independent,
              m.company_id AS mem_company_id
       FROM drivers d
       LEFT JOIN vehicles v ON v.id = d.active_vehicle_id
       LEFT JOIN driver_company_memberships m ON m.driver_id = d.id
       WHERE d.id = ANY($1::uuid[])`,
      [driverIdsForActive],
    );
    const activeByDriver = new Map(activeRows.rows.map((r: any) => [r.driver_id, r]));
    const beforeActive = driversWithSub.length;
    driversWithSub = driversWithSub.filter((driver: any) => {
      const a = activeByDriver.get(driver.id);
      if (!a?.active_vehicle_id) {
        console.log(`[createDispatchOffers] Driver ${driver.id} filtered: no active vehicle`);
        return false;
      }
      if (a.vehicle_status && a.vehicle_status !== "active") {
        console.log(`[createDispatchOffers] Driver ${driver.id} filtered: active vehicle not active`);
        return false;
      }
      if (a.vehicle_company_id) {
        if (a.membership_status !== "approved" || a.vehicle_company_id !== a.mem_company_id) {
          console.log(`[createDispatchOffers] Driver ${driver.id} filtered: company vehicle without approved membership`);
          return false;
        }
      } else if (!a.work_independent) {
        console.log(`[createDispatchOffers] Driver ${driver.id} filtered: personal vehicle but independent work off`);
        return false;
      }
      if (a.vehicle_capacity_litres) {
        driver.vehicle_capacity_litres = Number(a.vehicle_capacity_litres);
      }
      return true;
    });
    if (beforeActive > driversWithSub.length) {
      console.log(
        `[createDispatchOffers] Order ${orderId}: Excluded ${beforeActive - driversWithSub.length} driver(s) without valid active vehicle`,
      );
    }
    if (driversWithSub.length === 0) {
      console.log(`[createDispatchOffers] Order ${orderId}: No drivers left after active vehicle filter`);
      return 0;
    }

    // Get driver pricing for this fuel type
    const driverPricingRows = await db
      .select({
        driver_id: driverPricing.driverId,
        fuel_price_per_liter_cents: driverPricing.fuelPricePerLiterCents,
      })
      .from(driverPricing)
      .where(
        and(
          eq(driverPricing.fuelTypeId, fuelTypeId),
          eq(driverPricing.active, true),
          inArray(
            driverPricing.driverId,
            driversWithSub.map((d: any) => d.id),
          ),
        ),
      );

    // Create a map of driver_id to fuel_price_per_liter_cents
    const pricingMap = new Map(
      (driverPricingRows || []).map((p: any) => [p.driver_id, p.fuel_price_per_liter_cents])
    );

    console.log(`[createDispatchOffers] Order ${orderId}: Found ${driversWithSub.length} eligible drivers, ${driverPricingRows?.length || 0} with pricing for fuel type ${fuelTypeId}`);

    const radiusLimits = await getSubscriptionRadiusMiles();
    const maxRadiusMiles = radiusLimits.unlimited;

    // Filter drivers by:
    // 1. Has pricing set for this fuel type
    // 2. Vehicle capacity (if set)
    // 3. Within radius (if location is set); cap from admin pickup radius settings
    const eligibleDrivers = (driversWithSub as DriverWithLocation[]).filter((driver) => {
      // Must have pricing set
      if (!pricingMap.has(driver.id)) {
        console.log(`[createDispatchOffers] Driver ${driver.id} filtered out: No pricing set for fuel type ${fuelTypeId}`);
        return false;
      }

      // Check vehicle capacity
      if (driver.vehicle_capacity_litres && driver.vehicle_capacity_litres < litres) {
        console.log(`[createDispatchOffers] Driver ${driver.id} filtered out: Vehicle capacity ${driver.vehicle_capacity_litres}L < order ${litres}L`);
        return false;
      }

      if (driver.current_lat && driver.current_lng) {
        const distanceMiles = calculateDistance(
          driver.current_lat,
          driver.current_lng,
          dropLat,
          dropLng
        );
        const radiusPreference = maxRadiusMiles;
        const distanceKm = milesToKm(distanceMiles);
        console.log(`[createDispatchOffers] Driver ${driver.id}: Distance ${distanceKm.toFixed(2)}km (${distanceMiles.toFixed(2)} miles), Radius cap: ${radiusPreference} miles`);
        if (distanceMiles > radiusPreference) {
          console.log(`[createDispatchOffers] Driver ${driver.id} filtered out: Distance ${distanceMiles.toFixed(2)} miles > radius ${radiusPreference} miles`);
          return false;
        }
      } else {
        // Allow drivers without location if they have pricing (for testing/development)
        // In production, you might want to require location
        console.log(`[createDispatchOffers] Driver ${driver.id}: No location set, allowing anyway (has pricing)`);
      }

      return true;
    });

    if (eligibleDrivers.length === 0) {
      console.log(`[createDispatchOffers] No eligible drivers found for order ${orderId}. Total drivers with sub: ${driversWithSub.length}, With pricing: ${pricingMap.size}, Fuel type: ${fuelTypeId}`);
      return 0;
    }

    console.log(`[createDispatchOffers] Found ${eligibleDrivers.length} eligible drivers for order ${orderId}`);

    // Calculate distance and pricing for each driver
    const driversWithPricing = eligibleDrivers.map((driver) => {
      // Calculate distance from driver to customer (in km)
      let distanceKm = 0;
      if (driver.current_lat && driver.current_lng) {
        const distanceMiles = calculateDistance(
          driver.current_lat,
          driver.current_lng,
          dropLat,
          dropLng
        );
        distanceKm = milesToKm(distanceMiles);
      }

      // Get driver's fuel price per liter
      const fuelPricePerLiterCents = pricingMap.get(driver.id) || 0;

      // Calculate pricing
      const fuelCostCents = Math.round(fuelPricePerLiterCents * litres);
      const deliveryFeeCents = Math.round(pricePerKmCents * distanceKm);
      const totalCents = fuelCostCents + deliveryFeeCents;

      return {
        driver,
        distanceKm,
        fuelPricePerLiterCents,
        fuelCostCents,
        deliveryFeeCents,
        totalCents,
      };
    });

    // Filter by budget if specified
    let finalDrivers = driversWithPricing;
    if (maxBudgetCents && maxBudgetCents > 0) {
      finalDrivers = driversWithPricing.filter((d) => d.totalCents <= maxBudgetCents);
    }

    if (finalDrivers.length === 0) {
      console.log(`No drivers within budget for order ${orderId}`);
      return 0;
    }

    console.log(
      `[createDispatchOffers] Order ${orderId}: creating ${finalDrivers.length} offer(s)${
        excludeDriverIds?.size ? ` (${excludeDriverIds.size} driver(s) already had offers)` : ""
      }`,
    );

    return await createDriverOffersWithPricing(
      orderId,
      finalDrivers,
      pricePerKmCents,
      fuelTypeId,
      litres,
    );
  } catch (error) {
    console.error(`[createDispatchOffers] Error in createDispatchOffers for order ${orderId}:`, error);
    return 0;
  }
}

/**
 * Creates dispatch offers with automatically calculated pricing
 */
async function createDriverOffersWithPricing(
  orderId: string,
  drivers: Array<{
    driver: DriverWithLocation;
    distanceKm: number;
    fuelPricePerLiterCents: number;
    fuelCostCents: number;
    deliveryFeeCents: number;
    totalCents: number;
  }>,
  pricePerKmCents: number,
  fuelTypeId: string,
  litres: number,
): Promise<number> {
  if (drivers.length === 0) {
    return 0;
  }

  // Check if order was already accepted
  const orderRows = await db
    .select({ state: orders.state, assignedDriverId: orders.assignedDriverId })
    .from(orders)
    .where(eq(orders.id, orderId))
    .limit(1);
  const order = orderRows[0];

  if (order?.assignedDriverId) {
    return 0;
  }
  if (order?.state && !OPEN_ORDER_STATES.has(String(order.state))) {
    return 0;
  }

  // Create offers with automatically calculated pricing
  // State is "pending_customer" so customer can see and select immediately
  const offers = drivers.map((d) => ({
    order_id: orderId,
    driver_id: d.driver.id,
    state: "pending_customer" as const,
    proposed_price_per_km_cents: pricePerKmCents, // Admin-set price per km
    expires_at: getOpenDispatchOfferExpiry().toISOString(),
  }));

  const offerExpiry = getOpenDispatchOfferExpiry();

  const insertedOffers = await db
    .insert(dispatchOffers)
    .values(
      offers.map((o) => ({
        orderId: o.order_id,
        driverId: o.driver_id,
        state: o.state,
        proposedPricePerKmCents: o.proposed_price_per_km_cents,
        expiresAt: offerExpiry,
      })),
    )
    .returning({ id: dispatchOffers.id, driver_id: dispatchOffers.driverId });

  // Fetch fuel type label
  const fuelTypeRows = await db
    .select({ label: fuelTypes.label })
    .from(fuelTypes)
    .where(eq(fuelTypes.id, fuelTypeId))
    .limit(1);
  const fuelType = fuelTypeRows[0];

  const fuelLabel = fuelType?.label || "Fuel";

  // Create a map of driver_id to offer_id
  const offerMap = new Map(insertedOffers?.map(o => [o.driver_id, o.id]) || []);

  // Send real-time notifications to drivers
  for (const driverData of drivers) {
    const realOfferId = offerMap.get(driverData.driver.id);

    // Send dispatch offer WebSocket message for dashboard refresh
      websocketService.sendDispatchOffer(driverData.driver.user_id, {
        orderId,
        offerId: realOfferId,
        fuelTypeId,
        expiresAt: getOpenDispatchOfferExpiry().toISOString(),
      });

    // Send notification using helper if we have a real offer ID
    if (realOfferId) {
      await offerNotifications.onOfferReceived(
        driverData.driver.user_id,
        realOfferId,
        orderId,
        fuelLabel,
        litres,
        driverData.totalCents / 100, // Earnings in currency units
        "ZAR",
        "Driver location",
        "Customer location"
      );
    }
  }

  // Notify customer that offers are available
  const orderForCustomerRows = await db
    .select({ customer_user_id: customers.userId })
    .from(orders)
    .innerJoin(customers, eq(customers.id, orders.customerId))
    .where(eq(orders.id, orderId))
    .limit(1);
  const orderForCustomer = orderForCustomerRows[0];

  const added = insertedOffers?.length ?? 0;

  if (added > 0 && orderForCustomer?.customer_user_id) {
    websocketService.sendOrderUpdate(orderForCustomer.customer_user_id, {
      type: "driver_offers_available",
      orderId,
      offerCount: added,
    });

    await offerNotifications.onDriverOffersAvailable(
      orderForCustomer.customer_user_id,
      orderId,
      added,
    );
  }

  return added;
}


/**
 * Legacy: only times out old "offered" rows. Customer quotes (pending_customer) do not auto-expire.
 */
export async function expireOldOffers(): Promise<void> {
  try {
    await db
      .update(dispatchOffers)
      .set({ state: "timeout" })
      .where(and(eq(dispatchOffers.state, "offered"), lt(dispatchOffers.expiresAt, new Date())));
  } catch (error) {
    console.error("Error in expireOldOffers:", error);
  }
}
