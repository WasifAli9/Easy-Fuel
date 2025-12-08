import { supabaseAdmin } from "./supabase";
import { calculateDistance, milesToKm } from "./utils/distance";
import { websocketService } from "./websocket";
import { pushNotificationService } from "./push-service";
import { offerNotifications } from "./notification-helpers";

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
    const { data: appSettings, error: settingsError } = await supabaseAdmin
      .from("app_settings")
      .select("price_per_km_cents")
      .eq("id", 1)
      .single();

    if (settingsError) {
      console.error("Error fetching app settings:", settingsError);
      return;
    }

    const pricePerKmCents = appSettings?.price_per_km_cents || 5000; // Default R50 per km

    // Find all available drivers with location, radius, and capacity
    const { data: drivers, error: driversError } = await supabaseAdmin
      .from("drivers")
      .select("id, user_id, premium_status, current_lat, current_lng, job_radius_preference_miles, vehicle_capacity_litres");

    if (driversError) {
      console.error("Error fetching drivers:", driversError);
      return;
    }

    if (!drivers || drivers.length === 0) {
      return;
    }

    // Get driver pricing for this fuel type
    const { data: driverPricing, error: pricingError } = await supabaseAdmin
      .from("driver_pricing")
      .select("driver_id, fuel_price_per_liter_cents")
      .eq("fuel_type_id", fuelTypeId)
      .eq("active", true)
      .in("driver_id", drivers.map(d => d.id));

    if (pricingError) {
      console.error("Error fetching driver pricing:", pricingError);
    }

    // Create a map of driver_id to fuel_price_per_liter_cents
    const pricingMap = new Map(
      (driverPricing || []).map((p: any) => [p.driver_id, p.fuel_price_per_liter_cents])
    );

    console.log(`[createDispatchOffers] Order ${orderId}: Found ${drivers.length} drivers, ${driverPricing?.length || 0} with pricing for fuel type ${fuelTypeId}`);

    // Filter drivers by:
    // 1. Has pricing set for this fuel type
    // 2. Vehicle capacity (if set)
    // 3. Within radius (if location is set)
    const eligibleDrivers = (drivers as DriverWithLocation[]).filter((driver) => {
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

      // Check radius if location is set
      if (driver.current_lat && driver.current_lng) {
        const distanceMiles = calculateDistance(
          driver.current_lat,
          driver.current_lng,
          dropLat,
          dropLng
        );
        const radiusPreference = driver.job_radius_preference_miles || 50;
        const distanceKm = milesToKm(distanceMiles);
        console.log(`[createDispatchOffers] Driver ${driver.id}: Distance ${distanceKm.toFixed(2)}km (${distanceMiles.toFixed(2)} miles), Radius preference: ${radiusPreference} miles`);
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
      console.log(`[createDispatchOffers] No eligible drivers found for order ${orderId}. Total drivers: ${drivers.length}, With pricing: ${pricingMap.size}, Fuel type: ${fuelTypeId}`);
      return;
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
  const { data: order } = await supabaseAdmin
    .from("orders")
    .select("state, assigned_driver_id")
    .eq("id", orderId)
    .single();

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

  const { data: insertedOffers, error: offersError } = await supabaseAdmin
    .from("dispatch_offers")
    .insert(offers)
    .select("id, driver_id");

  if (offersError) {
    console.error(`Error creating ${isPremium ? 'premium' : 'regular'} driver offers:`, offersError);
    return;
  }

  // Fetch fuel type label
  const { data: fuelType } = await supabaseAdmin
    .from("fuel_types")
    .select("label")
    .eq("id", fuelTypeId)
    .single();

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
  const { data: orderForCustomer } = await supabaseAdmin
    .from("orders")
    .select("customer_id, customers(user_id)")
    .eq("id", orderId)
    .single();

  if (orderForCustomer?.customers?.user_id) {
    websocketService.sendOrderUpdate((orderForCustomer.customers as any).user_id, {
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
    const { error } = await supabaseAdmin
      .from("dispatch_offers")
      .update({ state: "timeout" })
      .eq("state", "offered")
      .lt("expires_at", new Date().toISOString());

    if (error) {
      console.error("Error expiring old offers:", error);
    }
  } catch (error) {
    console.error("Error in expireOldOffers:", error);
  }
}
