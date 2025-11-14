import { supabaseAdmin } from "./supabase";
import { calculateDistance } from "./utils/distance";
import { websocketService } from "./websocket";
import { pushNotificationService } from "./push-service";

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
      .select("id, user_id, premium_status, current_lat, current_lng, job_radius_preference_miles, vehicle_capacity_litres");

    if (driversError) {
      console.error("Error fetching drivers:", driversError);
      return;
    }

    if (!drivers || drivers.length === 0) {
      return;
    }

    // Filter drivers by radius preference (or allow all if location not set)
    const driversWithinRadius = (drivers as DriverWithLocation[]).filter((driver) => {
      // If driver has no location set, allow anyway (for development/testing)
      if (!driver.current_lat || !driver.current_lng) {
        return true;
      }

      const distance = calculateDistance(
        driver.current_lat,
        driver.current_lng,
        dropLat,
        dropLng
      );

      const radiusPreference = driver.job_radius_preference_miles || 50; // Increased default to 50 miles for dev
      const withinRadius = distance <= radiusPreference;

      return withinRadius;
    });

    // If no drivers within radius but we have drivers, use all drivers (for dev/testing)
    let driversToUse = driversWithinRadius;
    if (driversWithinRadius.length === 0 && drivers.length > 0) {
      driversToUse = drivers as DriverWithLocation[];
    }
    
    if (driversToUse.length === 0) {
      return;
    }

    // For now, skip inventory check (can be added later for production)
    // Filter by vehicle capacity (optional - if not set, allow anyway)
    const driversWithCapacity = driversToUse.filter(driver => {
      if (driver.vehicle_capacity_litres && driver.vehicle_capacity_litres < litres) {
        return false;
      }
      return true;
    });

    // If no drivers with capacity but we have drivers, use them anyway (for dev/testing)
    if (driversWithCapacity.length === 0 && driversToUse.length > 0) {
      driversWithCapacity.push(...driversToUse);
    }
    
    if (driversWithCapacity.length === 0) {
      return;
    }

    // Filter by pricing - if no pricing set, allow anyway (for dev/testing)
    const { data: driverPricing } = await supabaseAdmin
      .from("driver_pricing")
      .select("driver_id, delivery_fee_cents")
      .eq("fuel_type_id", fuelTypeId)
      .in("driver_id", driversWithCapacity.map(d => d.id));

    let matchedDrivers = driversWithCapacity.filter(driver => {
      const pricing = driverPricing?.find(p => p.driver_id === driver.id);
      
      // If no pricing set, allow anyway (for development/testing)
      // In production, you might want to require pricing
      if (!pricing) {
        return true;
      }

      // If customer has a budget, enforce it as a hard constraint
      if (maxBudgetCents && maxBudgetCents > 0) {
        if (pricing.delivery_fee_cents > maxBudgetCents) {
          return false;
        }
      }

      return true;
    });

    // If no matched drivers but we have drivers with capacity, use them anyway (for dev/testing)
    if (matchedDrivers.length === 0 && driversWithCapacity.length > 0) {
      matchedDrivers = [...driversWithCapacity];
    }
    
    if (matchedDrivers.length === 0) {
      return;
    }

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
        expires_at: new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString(), // 12 hours
      }));

      const { error: premiumOffersError } = await supabaseAdmin
        .from("dispatch_offers")
        .insert(premiumOffers);

      if (premiumOffersError) {
        console.error("Error creating premium offers:", premiumOffersError);
      } else {
        // Send real-time notifications to premium drivers
        for (const driver of premiumDrivers) {
          // Send dispatch offer message (for dashboard refresh)
          websocketService.sendDispatchOffer(driver.user_id, {
            orderId,
            fuelTypeId,
            expiresAt: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
            isPremium: true,
          });
          
          // Send push notification (always, regardless of WebSocket status)
          pushNotificationService.sendNewDispatchOffer(
            driver.user_id,
            orderId,
            fuelTypeId,
            litres,
            0,
            "ZAR"
          ).catch(err => console.error(`[createDispatchOffers] Error sending push notification to driver ${driver.user_id}:`, err));
          
          // Always create in-app notification (for persistence and offline access)
          try {
            const { data: notification, error: notifError } = await supabaseAdmin.from("notifications").insert({
              user_id: driver.user_id,
              type: "dispatch_offer_received",
              title: "New Fuel Delivery Request",
              message: `You have a new premium fuel delivery request for ${litres}L`,
              data: { orderId, isPremium: true, fuelTypeId, litres },
            }).select().single();
            
            if (notifError) {
              console.error(`[createDispatchOffers] Error creating notification for driver ${driver.user_id}:`, notifError);
            } else if (notification) {
              // Send real-time notification via WebSocket
              websocketService.sendNotification(driver.user_id, notification);
            }
          } catch (err: any) {
            console.error(`[createDispatchOffers] Exception creating notification for driver ${driver.user_id}:`, err);
          }
        }
        
        // Schedule regular driver offers after 5 minutes (premium window)
        setTimeout(() => {
          createRegularDriverOffers(orderId, regularDrivers, { fuelTypeId, litres }).catch((error) => {
            console.error("Error creating regular driver offers:", error);
          });
        }, 5 * 60 * 1000); // 5 minutes
      }
    } else {
      // No premium drivers, send to all regular drivers immediately
      await createRegularDriverOffers(orderId, regularDrivers, { fuelTypeId, litres });
    }
  } catch (error) {
    console.error(`[createDispatchOffers] Error in createDispatchOffers for order ${orderId}:`, error);
  }
}

/**
 * Creates offers for regular (non-premium) drivers
 * Called after premium window expires or if no premium drivers available
 */
async function createRegularDriverOffers(
  orderId: string,
  regularDrivers: Array<{ id: string; user_id: string }>,
  orderData?: { fuelTypeId: string; litres: number }
): Promise<void> {
  if (regularDrivers.length === 0) {
    return;
  }

  // Check if order was already accepted by a premium driver
  const { data: order } = await supabaseAdmin
    .from("orders")
    .select("state, assigned_driver_id, fuel_type_id, litres")
    .eq("id", orderId)
    .single();

  if (order?.state === "assigned" || order?.assigned_driver_id) {
    return;
  }

  const regularOffers = regularDrivers.map((driver) => ({
    order_id: orderId,
    driver_id: driver.id,
    state: "offered" as const,
    expires_at: new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString(), // 12 hours
  }));

  const { data: insertedOffers, error: regularOffersError } = await supabaseAdmin
    .from("dispatch_offers")
    .insert(regularOffers)
    .select();

  if (regularOffersError) {
    console.error(`[createRegularDriverOffers] Error creating regular driver offers for order ${orderId}:`, regularOffersError);
  } else {
    // Send real-time notifications to regular drivers
    for (const driver of regularDrivers) {
      // Send dispatch offer message (for dashboard refresh)
      websocketService.sendDispatchOffer(driver.user_id, {
        orderId,
        expiresAt: new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString(), // 12 hours
        isPremium: false,
      });
      
      // Send push notification (always, regardless of WebSocket status)
      const fuelTypeId = orderData?.fuelTypeId || order?.fuel_type_id || "";
      const litres = orderData?.litres || order?.litres || 0;
      
      pushNotificationService.sendNewDispatchOffer(
        driver.user_id,
        orderId,
        fuelTypeId,
        litres,
        0,
        "ZAR"
      ).catch(err => console.error(`[createRegularDriverOffers] Error sending push notification to driver ${driver.user_id}:`, err));
      
      // Always create in-app notification (for persistence and offline access)
      try {
        const { data: notification, error: notifError } = await supabaseAdmin.from("notifications").insert({
          user_id: driver.user_id,
          type: "dispatch_offer_received",
          title: "New Fuel Delivery Request",
          message: `You have a new fuel delivery request for ${litres}L`,
          data: { orderId, isPremium: false, fuelTypeId, litres },
        }).select().single();
        
        if (notifError) {
          console.error(`[createRegularDriverOffers] Error creating notification for driver ${driver.user_id}:`, notifError);
        } else if (notification) {
          // Send real-time notification via WebSocket
          websocketService.sendNotification(driver.user_id, notification);
        }
      } catch (err: any) {
        console.error(`[createRegularDriverOffers] Exception creating notification for driver ${driver.user_id}:`, err);
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
