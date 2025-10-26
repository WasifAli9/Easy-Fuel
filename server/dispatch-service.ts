import { supabaseAdmin } from "./supabase";

interface CreateDispatchOffersParams {
  orderId: string;
  fuelTypeId: string;
  dropLat: number;
  dropLng: number;
}

/**
 * Creates dispatch offers for an order
 * Premium drivers receive offers first (5 minute window)
 * If no premium driver accepts, offers go to all available drivers
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

    // Create offers for premium drivers first (5 minute window)
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
      }
    }

    // Create offers for all drivers (15 minute window)
    // These will be available immediately but premium drivers see them first
    const allOffers = drivers.map((driver) => ({
      order_id: orderId,
      driver_id: driver.id,
      state: "offered" as const,
      expires_at: new Date(Date.now() + 15 * 60 * 1000).toISOString(), // 15 minutes
    }));

    // Use upsert to avoid duplicates (premium drivers already have offers)
    const { error: allOffersError } = await supabaseAdmin
      .from("dispatch_offers")
      .upsert(allOffers, {
        onConflict: "order_id,driver_id",
        ignoreDuplicates: true,
      });

    if (allOffersError) {
      console.error("Error creating dispatch offers:", allOffersError);
    } else {
      console.log(`Created dispatch offers for all ${drivers.length} drivers`);
    }
  } catch (error) {
    console.error("Error in createDispatchOffers:", error);
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
