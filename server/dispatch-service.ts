import { supabaseAdmin } from "./supabase";
import { calculateDistance } from "./utils/distance";

interface CreateDispatchOffersParams {
  orderId: string;
  fuelTypeId: string;
  dropLat: number;
  dropLng: number;
}

interface DriverWithLocation {
  id: string;
  premium_status: string;
  availability_status: string;
  current_lat: number | null;
  current_lng: number | null;
  job_radius_preference_miles: number;
}

/**
 * Creates dispatch offers for an order
 * Premium drivers receive offers first (5 minute exclusive window)
 * After 5 minutes, if no premium driver accepts, offers go to all drivers
 * Only drivers within their radius preference receive offers
 */
export async function createDispatchOffers({
  orderId,
  fuelTypeId,
  dropLat,
  dropLng,
}: CreateDispatchOffersParams): Promise<void> {
  try {
    // Find all available drivers with location and radius preferences
    const { data: drivers, error: driversError } = await supabaseAdmin
      .from("drivers")
      .select("id, premium_status, availability_status, current_lat, current_lng, job_radius_preference_miles")
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

    // Separate premium and regular drivers
    const premiumDrivers = driversWithinRadius.filter(
      (d) => d.premium_status === "active"
    );
    const regularDrivers = driversWithinRadius.filter(
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
  regularDrivers: Array<{ id: string }>
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
