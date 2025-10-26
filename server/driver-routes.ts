import { Router } from "express";
import { supabaseAdmin } from "./supabase";
import { sendDriverAcceptanceEmail } from "./email-service";

const router = Router();

/**
 * Helper function to send customer notification email when driver accepts order
 */
async function sendCustomerNotification(
  orderId: string,
  driverId: string,
  confirmedDeliveryTime: string
): Promise<void> {
  try {
    // Get order details with customer info
    const { data: order, error: orderError } = await supabaseAdmin
      .from("orders")
      .select(`
        *,
        customers (
          id,
          company_name,
          user_id
        ),
        fuel_types (
          label
        ),
        delivery_addresses (
          address_street,
          address_city,
          address_province
        )
      `)
      .eq("id", orderId)
      .single();

    if (orderError || !order) {
      throw new Error("Order not found");
    }

    // Get customer email from Supabase Auth
    const { data: customerUser, error: customerUserError } = 
      await supabaseAdmin.auth.admin.getUserById(order.customers.user_id);

    if (customerUserError || !customerUser?.user?.email) {
      throw new Error("Customer email not found");
    }

    // Get driver details
    const { data: driver, error: driverError } = await supabaseAdmin
      .from("drivers")
      .select("*")
      .eq("id", driverId)
      .single();

    if (driverError || !driver) {
      throw new Error("Driver not found");
    }

    // Get driver's profile for name
    const { data: driverProfile, error: driverProfileError } = 
      await supabaseAdmin
        .from("profiles")
        .select("full_name, phone")
        .eq("id", driver.user_id)
        .single();

    if (driverProfileError || !driverProfile) {
      throw new Error("Driver profile not found");
    }

    // Format delivery address
    const deliveryAddress = order.delivery_addresses
      ? `${order.delivery_addresses.address_street}, ${order.delivery_addresses.address_city}, ${order.delivery_addresses.address_province}`
      : "Address not specified";

    // Format confirmed delivery time
    const formattedTime = new Date(confirmedDeliveryTime).toLocaleString("en-ZA", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: "Africa/Johannesburg",
    });

    // Send email
    await sendDriverAcceptanceEmail({
      customerEmail: customerUser.user.email,
      customerName: order.customers.company_name || "Customer",
      orderNumber: order.id.substring(0, 8).toUpperCase(),
      driverName: driverProfile.full_name || "Driver",
      driverPhone: driverProfile.phone || "Not available",
      confirmedDeliveryTime: formattedTime,
      fuelType: order.fuel_types?.label || "Fuel",
      litres: order.litres,
      deliveryAddress,
    });

    console.log(`Customer notification sent for order ${orderId}`);
  } catch (error) {
    console.error("Error sending customer notification:", error);
    throw error;
  }
}

// Get all pending dispatch offers for the authenticated driver
router.get("/offers", async (req, res) => {
  const user = (req as any).user;

  try {
    // Get driver ID from user ID
    const { data: driver, error: driverError } = await supabaseAdmin
      .from("drivers")
      .select("id")
      .eq("user_id", user.id)
      .single();

    if (driverError) throw driverError;
    if (!driver) {
      return res.status(404).json({ error: "Driver profile not found" });
    }

    // Fetch pending offers with order and customer details
    const { data: offers, error: offersError } = await supabaseAdmin
      .from("dispatch_offers")
      .select(`
        *,
        orders (
          *,
          fuel_types (
            id,
            label,
            code
          ),
          delivery_addresses (
            id,
            label,
            address_street,
            address_city,
            address_province
          ),
          customers (
            id,
            company_name,
            user_id
          )
        )
      `)
      .eq("driver_id", driver.id)
      .eq("state", "offered")
      .gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false });

    if (offersError) throw offersError;

    res.json(offers || []);
  } catch (error: any) {
    console.error("Error fetching driver offers:", error);
    res.status(500).json({ error: error.message });
  }
});

// Accept a dispatch offer
router.post("/offers/:id/accept", async (req, res) => {
  const user = (req as any).user;
  const offerId = req.params.id;
  const { confirmedDeliveryTime } = req.body;

  try {
    // Validate confirmed delivery time
    if (!confirmedDeliveryTime) {
      return res.status(400).json({ 
        error: "Confirmed delivery time is required" 
      });
    }

    // Get driver ID from user ID
    const { data: driver, error: driverError } = await supabaseAdmin
      .from("drivers")
      .select("id")
      .eq("user_id", user.id)
      .single();

    if (driverError) throw driverError;
    if (!driver) {
      return res.status(404).json({ error: "Driver profile not found" });
    }

    // Check if offer exists and belongs to this driver
    const { data: offer, error: offerCheckError } = await supabaseAdmin
      .from("dispatch_offers")
      .select("*, orders(*)")
      .eq("id", offerId)
      .eq("driver_id", driver.id)
      .single();

    if (offerCheckError) throw offerCheckError;
    if (!offer) {
      return res.status(404).json({ error: "Offer not found" });
    }

    // Check if offer has expired
    if (new Date(offer.expires_at) < new Date()) {
      return res.status(400).json({ error: "Offer has expired" });
    }

    // Check if offer is still in offered state
    if (offer.state !== "offered") {
      return res.status(400).json({ 
        error: `Offer is already ${offer.state}` 
      });
    }

    // Check if order is still in created state
    if (offer.orders.state !== "created") {
      return res.status(400).json({ 
        error: "Order is no longer available" 
      });
    }

    // Begin transaction: update offer, reject other offers, update order
    
    // 1. Accept this offer
    const { error: acceptError } = await supabaseAdmin
      .from("dispatch_offers")
      .update({ state: "accepted", updated_at: new Date().toISOString() })
      .eq("id", offerId);

    if (acceptError) throw acceptError;

    // 2. Reject all other offers for this order
    const { error: rejectError } = await supabaseAdmin
      .from("dispatch_offers")
      .update({ state: "rejected", updated_at: new Date().toISOString() })
      .eq("order_id", offer.order_id)
      .neq("id", offerId)
      .eq("state", "offered");

    if (rejectError) {
      console.error("Error rejecting other offers:", rejectError);
    }

    // 3. Update order with assigned driver and confirmed delivery time
    const { error: orderError } = await supabaseAdmin
      .from("orders")
      .update({
        state: "assigned",
        assigned_driver_id: driver.id,
        confirmed_delivery_time: confirmedDeliveryTime,
        updated_at: new Date().toISOString(),
      })
      .eq("id", offer.order_id);

    if (orderError) throw orderError;

    // 4. Update driver availability
    const { error: availabilityError } = await supabaseAdmin
      .from("drivers")
      .update({ 
        availability_status: "on_delivery",
        updated_at: new Date().toISOString(),
      })
      .eq("id", driver.id);

    if (availabilityError) {
      console.error("Error updating driver availability:", availabilityError);
    }

    // 5. Send email notification to customer (async, don't wait)
    sendCustomerNotification(offer.order_id, driver.id, confirmedDeliveryTime)
      .catch((error: any) => {
        console.error("Error sending customer notification:", error);
      });

    res.json({ success: true, message: "Offer accepted successfully" });
  } catch (error: any) {
    console.error("Error accepting offer:", error);
    res.status(500).json({ error: error.message });
  }
});

// Reject a dispatch offer
router.post("/offers/:id/reject", async (req, res) => {
  const user = (req as any).user;
  const offerId = req.params.id;

  try {
    // Get driver ID from user ID
    const { data: driver, error: driverError } = await supabaseAdmin
      .from("drivers")
      .select("id")
      .eq("user_id", user.id)
      .single();

    if (driverError) throw driverError;
    if (!driver) {
      return res.status(404).json({ error: "Driver profile not found" });
    }

    // Check if offer exists and belongs to this driver
    const { data: offer, error: offerCheckError } = await supabaseAdmin
      .from("dispatch_offers")
      .select("*")
      .eq("id", offerId)
      .eq("driver_id", driver.id)
      .single();

    if (offerCheckError) throw offerCheckError;
    if (!offer) {
      return res.status(404).json({ error: "Offer not found" });
    }

    // Check if offer is still in offered state
    if (offer.state !== "offered") {
      return res.status(400).json({ 
        error: `Offer is already ${offer.state}` 
      });
    }

    // Reject the offer
    const { error: rejectError } = await supabaseAdmin
      .from("dispatch_offers")
      .update({ state: "rejected", updated_at: new Date().toISOString() })
      .eq("id", offerId);

    if (rejectError) throw rejectError;

    res.json({ success: true, message: "Offer rejected successfully" });
  } catch (error: any) {
    console.error("Error rejecting offer:", error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
