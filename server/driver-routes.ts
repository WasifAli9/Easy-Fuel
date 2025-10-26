import { Router } from "express";
import { supabaseAdmin } from "./supabase";

const router = Router();

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
