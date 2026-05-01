import { db } from "./db";
import { calculateDistance, milesToKm } from "./utils/distance";
import { websocketService } from "./websocket";
import { pushNotificationService } from "./push-service";
import { offerNotifications } from "./notification-helpers";
import { getSubscriptionRadiusMiles } from "./subscription-service";
import {
  appSettings,
  customers,
  dispatchOffers,
  driverCompanyMemberships,
  driverPricing,
  driverSubscriptions,
  drivers,
  fuelTypes,
  orders,
} from "@shared/schema";
import { and, eq, gte, inArray, isNotNull, lt } from "drizzle-orm";

interface CreateDispatchOffersParams {
  orderId: string;
  fuelTypeId: string;
  dropLat: number;
  dropLng: number;
  litres: number;
  maxBudgetCents?: number | null;
}

interface DriverWithLocation {
  id: string;
  user_id: string;
  premium_status: string;
  availability_status: string;
  current_lat: number | null;
  current_lng: number | null;
  job_radius_preference_miles: number;
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
 * 
 * Premium drivers receive offers first (5 minute exclusive window)
 */
export async function createDispatchOffers({
  orderId,
  fuelTypeId,
  dropLat,
  dropLng,
  litres,
  maxBudgetCents,
}: CreateDispatchOffersParams): Promise<void> {
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
        premium_status: drivers.premiumStatus,
        availability_status: drivers.availabilityStatus,
        current_lat: drivers.currentLat,
        current_lng: drivers.currentLng,
        job_radius_preference_miles: drivers.jobRadiusPreferenceMiles,
        vehicle_capacity_litres: drivers.vehicleCapacityLitres,
        status: drivers.status,
        compliance_status: drivers.complianceStatus,
      })
      .from(drivers)
      .where(and(eq(drivers.status, "active"), eq(drivers.complianceStatus, "approved")));

    if (!driversRows || driversRows.length === 0) {
      return;
    }

    // Only drivers with active subscription can receive offers (§4.0)
    const today = new Date().toISOString().split("T")[0];
    const activeSubs = await db
      .select({ driver_id: driverSubscriptions.driverId, plan_code: driverSubscriptions.planCode })
      .from(driverSubscriptions)
      .where(
        and(
          eq(driverSubscriptions.status, "active"),
          gte(driverSubscriptions.currentPeriodEnd, new Date(`${today}T00:00:00.000Z`)),
          inArray(
            driverSubscriptions.driverId,
            driversRows.map((d: any) => d.id),
          ),
        ),
      );
    const subscribedDriverIds = new Set((activeSubs || []).map((s: any) => s.driver_id));
    const driverTierMap = new Map((activeSubs || []).map((s: any) => [s.driver_id, s.plan_code]));
    let driversWithSub = (driversRows as any[]).filter((d) => subscribedDriverIds.has(d.id));
    if (driversWithSub.length === 0) {
      console.log(`[createDispatchOffers] Order ${orderId}: No drivers with active subscription`);
      return;
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
      return;
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

    console.log(`[createDispatchOffers] Order ${orderId}: Found ${driversWithSub.length} drivers with subscription, ${driverPricingRows?.length || 0} with pricing for fuel type ${fuelTypeId}`);

    // Radius limits from app_settings (admin-editable)
    const radiusLimits = await getSubscriptionRadiusMiles();
    const tierToMiles = (planCode: string) =>
      planCode === "premium" ? radiusLimits.unlimited : planCode === "professional" ? radiusLimits.extended : radiusLimits.standard;

    // Filter drivers by:
    // 1. Has pricing set for this fuel type
    // 2. Vehicle capacity (if set)
    // 3. Within radius (if location is set); cap radius by subscription tier
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

      // Check radius if location is set; cap by subscription tier (standard / extended / unlimited)
      if (driver.current_lat && driver.current_lng) {
        const distanceMiles = calculateDistance(
          driver.current_lat,
          driver.current_lng,
          dropLat,
          dropLng
        );
        const planCode = driverTierMap.get(driver.id) || "starter";
        const tierMaxMiles = tierToMiles(planCode);
        // Radius is set by subscription plan only (no driver-editable preference)
        const radiusPreference = tierMaxMiles;
        const distanceKm = milesToKm(distanceMiles);
        console.log(`[createDispatchOffers] Driver ${driver.id}: Distance ${distanceKm.toFixed(2)}km (${distanceMiles.toFixed(2)} miles), Radius cap: ${radiusPreference} miles (tier ${planCode})`);
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
      return;
    }

    // Sort: Premium first (ratings boost), then Professional, then Starter
    const tierOrder = (code: string) => (code === "premium" ? 0 : code === "professional" ? 1 : 2);
    eligibleDrivers.sort((a, b) => tierOrder(driverTierMap.get(a.id) || "starter") - tierOrder(driverTierMap.get(b.id) || "starter"));

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
      return;
    }

    // Create offers for ALL drivers immediately (no premium window)
    // Customer sees all drivers with pricing right away
    console.log(
      `Found ${finalDrivers.length} drivers with pricing - creating offers immediately`
    );

    await createDriverOffersWithPricing(orderId, finalDrivers, pricePerKmCents, fuelTypeId, litres, false);
  } catch (error) {
    console.error(`[createDispatchOffers] Error in createDispatchOffers for order ${orderId}:`, error);
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
  isPremium: boolean
): Promise<void> {
  if (drivers.length === 0) {
    return;
  }

  // Check if order was already accepted
  const orderRows = await db
    .select({ state: orders.state, assigned_driver_id: orders.assignedDriverId })
    .from(orders)
    .where(eq(orders.id, orderId))
    .limit(1);
  const order = orderRows[0];

  if (order?.state === "assigned" || order?.assigned_driver_id) {
    return;
  }

  // Create offers with automatically calculated pricing
  // State is "pending_customer" so customer can see and select immediately
  const offers = drivers.map((d) => ({
    order_id: orderId,
    driver_id: d.driver.id,
    state: "pending_customer" as const,
    proposed_price_per_km_cents: pricePerKmCents, // Admin-set price per km
    expires_at: new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString(), // 12 hours
  }));

  const insertedOffers = await db
    .insert(dispatchOffers)
    .values(
      offers.map((o) => ({
        orderId: o.order_id,
        driverId: o.driver_id,
        state: o.state,
        proposedPricePerKmCents: o.proposed_price_per_km_cents,
        expiresAt: new Date(o.expires_at),
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
        expiresAt: new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString(),
        isPremium: false, // All drivers treated equally now
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

  if (orderForCustomer?.customer_user_id) {
    websocketService.sendOrderUpdate(orderForCustomer.customer_user_id, {
      type: "driver_offers_available",
      orderId,
      offerCount: insertedOffers?.length || 0,
    });
  }
}


/**
 * Expires old dispatch offers that haven't been accepted
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
