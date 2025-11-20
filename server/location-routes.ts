import { Router } from "express";
import { supabaseAdmin } from "./supabase";
import { z } from "zod";

const router = Router();

const updateLocationSchema = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  accuracy: z.number().optional(),
});

router.post("/update", async (req, res) => {
  const user = (req as any).user;

  try {
    const validated = updateLocationSchema.parse(req.body);

    const { data: driver, error: driverError } = await supabaseAdmin
      .from("drivers")
      .select("id, availability_status")
      .eq("user_id", user.id)
      .single();

    if (driverError || !driver) {
      return res.status(404).json({ error: "Driver profile not found" });
    }

    const { error: updateError } = await supabaseAdmin
      .from("drivers")
      .update({
        current_lat: validated.latitude,
        current_lng: validated.longitude,
        updated_at: new Date().toISOString(),
      })
      .eq("id", driver.id);

    if (updateError) throw updateError;

    const { error: historyError } = await supabaseAdmin
      .from("driver_locations")
      .insert({
        driver_id: driver.id,
        latitude: validated.latitude,
        longitude: validated.longitude,
        accuracy: validated.accuracy,
        recorded_at: new Date().toISOString(),
      });

    if (historyError) {
      console.error("Error saving location history:", historyError);
    }

    res.json({ success: true, message: "Location updated successfully" });
  } catch (error: any) {
    console.error("Error updating driver location:", error);
    res.status(400).json({ error: error.message });
  }
});

router.get("/driver/:driverId", async (req, res) => {
  const user = (req as any).user;
  const { driverId } = req.params;

  try {
    const { data: customer, error: customerError } = await supabaseAdmin
      .from("customers")
      .select("id")
      .eq("user_id", user.id)
      .single();

    if (customerError || !customer) {
      return res.status(403).json({ error: "Only customers can view driver locations" });
    }

    const { data: order, error: orderError } = await supabaseAdmin
      .from("orders")
      .select("id, state")
      .eq("customer_id", customer.id)
      .eq("assigned_driver_id", driverId)
      .in("state", ["assigned", "en_route", "in_progress"])
      .single();

    if (orderError || !order) {
      return res.status(403).json({ 
        error: "You can only view the location of drivers assigned to your active orders" 
      });
    }

    const { data: driver, error: driverLocationError } = await supabaseAdmin
      .from("drivers")
      .select("current_lat, current_lng, updated_at")
      .eq("id", driverId)
      .single();

    if (driverLocationError || !driver) {
      return res.status(404).json({ error: "Driver location not found" });
    }

    if (!driver.current_lat || !driver.current_lng) {
      return res.status(404).json({ error: "Driver location not available" });
    }

    res.json({
      latitude: driver.current_lat,
      longitude: driver.current_lng,
      lastUpdate: driver.updated_at,
    });
  } catch (error: any) {
    console.error("Error fetching driver location:", error);
    res.status(500).json({ error: error.message });
  }
});

router.get("/history/:orderId", async (req, res) => {
  const user = (req as any).user;
  const { orderId } = req.params;

  try {
    const { data: order, error: orderError } = await supabaseAdmin
      .from("orders")
      .select("assigned_driver_id, customer_id, customers!inner(user_id)")
      .eq("id", orderId)
      .single();

    if (orderError || !order) {
      return res.status(404).json({ error: "Order not found" });
    }

    const customerUserId = (order.customers as any).user_id;
    if (customerUserId !== user.id) {
      return res.status(403).json({ error: "You can only view location history for your own orders" });
    }

    if (!order.assigned_driver_id) {
      return res.status(404).json({ error: "No driver assigned to this order" });
    }

    const { data: locations, error: locationsError } = await supabaseAdmin
      .from("driver_locations")
      .select("latitude, longitude, accuracy, recorded_at")
      .eq("driver_id", order.assigned_driver_id)
      .order("recorded_at", { ascending: true })
      .limit(100);

    if (locationsError) throw locationsError;

    res.json(locations || []);
  } catch (error: any) {
    console.error("Error fetching location history:", error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
