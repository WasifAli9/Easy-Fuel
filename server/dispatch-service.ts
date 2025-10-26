import { supabaseAdmin } from "./supabase";

interface CreateDispatchOffersParams {
  orderId: string;
  fuelTypeId: string;
  dropLat: number;
  dropLng: number;
}

/**
 * Creates dispatch offers for an order
 * Premium drivers receive offers first (5 minute exclusive window)
 * After 5 minutes, if no premium driver accepts, offers go to all drivers
 */
export async function createDispatchOffers({
  orderId,
  fuelTypeId,
  dropLat,
  dropLng,
}: CreateDispatchOffersParams): Promise<void> {
  try {
    // Find all available drivers
    const { data: drivers, error: driversError } = await supabaseAdmin
      .from("drivers")
      .select("id, premium_status, availability_status")
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

    // Separate premium and regular drivers
    const premiumDrivers = drivers.filter(
      (d) => d.premium_status === "active"
    );
    const regularDrivers = drivers.filter(
      (d) => d.premium_status !== "active"
    );

    console.log(
      `Found ${premiumDrivers.length} premium and ${regularDrivers.length} regular drivers`
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
