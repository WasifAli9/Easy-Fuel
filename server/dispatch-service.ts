import { supabaseAdmin } from "./supabase";
import { calculateDistance } from "./utils/distance";
import { websocketService } from "./websocket";

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
 * Creates dispatch offers for an order
 * Matches drivers based on:
 * 1. Fuel inventory (has the fuel type with enough litres)
 * 2. Vehicle capacity
 * 3. Proximity (within radius preference)
 * 4. Pricing (fits customer budget if specified)
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
    // Find all available drivers with location, radius, and capacity
    const { data: drivers, error: driversError } = await supabaseAdmin
      .from("drivers")
      .select("id, user_id, premium_status, availability_status, current_lat, current_lng, job_radius_preference_miles, vehicle_capacity_litres")
      .eq("availability_status", "available")
      .eq("kyc_status", "approved");

    if (driversError) {
      console.error("Error fetching drivers:", driversError);
      return;
    }

    if (!drivers || drivers.length === 0) {
      console.log(`No available drivers found for order ${orderId}`);
      return;
    }

    // Filter drivers by radius preference
    const driversWithinRadius = (drivers as DriverWithLocation[]).filter((driver) => {
      // Skip drivers without location set
      if (!driver.current_lat || !driver.current_lng) {
        console.log(`Driver ${driver.id} has no location set, skipping`);
        return false;
      }

      const distance = calculateDistance(
        driver.current_lat,
        driver.current_lng,
        dropLat,
        dropLng
      );

      const radiusPreference = driver.job_radius_preference_miles || 20; // Default 20 miles
      const withinRadius = distance <= radiusPreference;

      console.log(
        `Driver ${driver.id}: distance=${distance.toFixed(1)} miles, preference=${radiusPreference} miles, within radius=${withinRadius}`
      );

      return withinRadius;
    });

    if (driversWithinRadius.length === 0) {
      console.log(`No drivers within radius for order ${orderId} (location: ${dropLat}, ${dropLng})`);
      return;
    }

    // Filter by fuel inventory (driver must have the fuel type with enough stock)
    const driverIds = driversWithinRadius.map(d => d.id);
    const { data: inventories } = await supabaseAdmin
      .from("driver_inventories")
      .select("driver_id, current_litres")
      .eq("fuel_type_id", fuelTypeId)
      .in("driver_id", driverIds)
      .gte("current_litres", litres);

    const driversWithFuel = driversWithinRadius.filter(driver => {
      const hasInventory = inventories?.some(inv => inv.driver_id === driver.id);
      if (!hasInventory) {
        console.log(`Driver ${driver.id} doesn't have ${litres}L of requested fuel type`);
      }
      return hasInventory;
    });

    if (driversWithFuel.length === 0) {
      console.log(`No drivers with sufficient fuel inventory for order ${orderId}`);
      return;
    }

    // Filter by vehicle capacity
    const driversWithCapacity = driversWithFuel.filter(driver => {
      if (!driver.vehicle_capacity_litres) {
        console.log(`Driver ${driver.id} has no vehicle capacity set, skipping`);
        return false;
      }
      if (driver.vehicle_capacity_litres < litres) {
        console.log(`Driver ${driver.id} vehicle capacity (${driver.vehicle_capacity_litres}L) < order quantity (${litres}L)`);
        return false;
      }
      return true;
    });

    if (driversWithCapacity.length === 0) {
      console.log(`No drivers with sufficient vehicle capacity for order ${orderId}`);
      return;
    }

    // Filter by pricing - ALWAYS required, budget check is additional constraint
    const { data: driverPricing } = await supabaseAdmin
      .from("driver_pricing")
      .select("driver_id, delivery_fee_cents")
      .eq("fuel_type_id", fuelTypeId)
      .in("driver_id", driversWithCapacity.map(d => d.id));

    const matchedDrivers = driversWithCapacity.filter(driver => {
      const pricing = driverPricing?.find(p => p.driver_id === driver.id);
      
      // Always require pricing - drivers without pricing records cannot receive offers
      if (!pricing) {
        console.log(`Driver ${driver.id} has no pricing set for this fuel type - excluding`);
        return false;
      }

      // If customer has a budget, enforce it as a hard constraint
      if (maxBudgetCents && maxBudgetCents > 0) {
        if (pricing.delivery_fee_cents > maxBudgetCents) {
          console.log(`Driver ${driver.id} delivery fee (R${(pricing.delivery_fee_cents / 100).toFixed(2)}) exceeds budget (R${(maxBudgetCents / 100).toFixed(2)})`);
          return false;
        }
      }

      return true;
    });

    if (matchedDrivers.length === 0) {
      console.log(`No drivers matching all criteria (location, inventory, capacity, pricing) for order ${orderId}`);
      return;
    }

    console.log(`Found ${matchedDrivers.length} drivers matching all criteria for order ${orderId}`);

    // Separate premium and regular drivers
    const premiumDrivers = matchedDrivers.filter(
      (d) => d.premium_status === "active"
    );
    const regularDrivers = matchedDrivers.filter(
      (d) => d.premium_status !== "active"
    );

    console.log(
      `Found ${premiumDrivers.length} premium and ${regularDrivers.length} regular drivers within radius`
    );

    // Create offers for premium drivers first (5 minute exclusive window)
    if (premiumDrivers.length > 0) {
      const premiumOffers = premiumDrivers.map((driver) => ({
        order_id: orderId,
        driver_id: driver.id,
        state: "offered" as const,
        expires_at: new Date(Date.now() + 5 * 60 * 1000).toISOString(), // 5 minutes
      }));

      const { error: premiumOffersError } = await supabaseAdmin
        .from("dispatch_offers")
        .insert(premiumOffers);

      if (premiumOffersError) {
        console.error("Error creating premium offers:", premiumOffersError);
      } else {
        console.log(`Created ${premiumOffers.length} premium dispatch offers`);
        
        // Send real-time notifications to premium drivers
        for (const driver of premiumDrivers) {
          const sent = websocketService.sendDispatchOffer(driver.user_id, {
            orderId,
            fuelTypeId,
            expiresAt: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
            isPremium: true,
          });
          
          // If WebSocket notification fails, create in-app notification
          if (!sent) {
            await supabaseAdmin.from("notifications").insert({
              user_id: driver.user_id,
              type: "dispatch_offer",
              title: "New Fuel Delivery Request",
              body: "You have a new premium fuel delivery request",
              data: { orderId, isPremium: true },
            });
          }
        }
        
        // Schedule regular driver offers after 5 minutes (premium window)
        setTimeout(() => {
          createRegularDriverOffers(orderId, regularDrivers).catch((error) => {
            console.error("Error creating regular driver offers:", error);
          });
        }, 5 * 60 * 1000); // 5 minutes
      }
    } else {
      // No premium drivers, send to all regular drivers immediately
      await createRegularDriverOffers(orderId, regularDrivers);
    }
  } catch (error) {
    console.error("Error in createDispatchOffers:", error);
  }
}

/**
 * Creates offers for regular (non-premium) drivers
 * Called after premium window expires or if no premium drivers available
 */
async function createRegularDriverOffers(
  orderId: string,
  regularDrivers: Array<{ id: string; user_id: string }>
): Promise<void> {
  if (regularDrivers.length === 0) {
    console.log(`No regular drivers to offer order ${orderId}`);
    return;
  }

  // Check if order was already accepted by a premium driver
  const { data: order } = await supabaseAdmin
    .from("orders")
    .select("state, assigned_driver_id")
    .eq("id", orderId)
    .single();

  if (order?.state === "assigned" || order?.assigned_driver_id) {
    console.log(`Order ${orderId} already assigned, skipping regular driver offers`);
    return;
  }

  const regularOffers = regularDrivers.map((driver) => ({
    order_id: orderId,
    driver_id: driver.id,
    state: "offered" as const,
    expires_at: new Date(Date.now() + 15 * 60 * 1000).toISOString(), // 15 minutes
  }));

  const { error: regularOffersError } = await supabaseAdmin
    .from("dispatch_offers")
    .insert(regularOffers);

  if (regularOffersError) {
    console.error("Error creating regular driver offers:", regularOffersError);
  } else {
    console.log(`Created ${regularOffers.length} regular driver dispatch offers`);
    
    // Send real-time notifications to regular drivers
    for (const driver of regularDrivers) {
      const sent = websocketService.sendDispatchOffer(driver.user_id, {
        orderId,
        expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
        isPremium: false,
      });
      
      // If WebSocket notification fails, create in-app notification
      if (!sent) {
        await supabaseAdmin.from("notifications").insert({
          user_id: driver.user_id,
          type: "dispatch_offer",
          title: "New Fuel Delivery Request",
          body: "You have a new fuel delivery request",
          data: { orderId, isPremium: false },
        });
      }
    }
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
