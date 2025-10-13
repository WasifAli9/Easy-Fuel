import { Router } from "express";
import { supabaseAdmin } from "./supabase";

const router = Router();

// Get all fuel types (for order creation)
router.get("/fuel-types", async (req, res) => {
  try {
    const { data: fuelTypes, error } = await supabaseAdmin
      .from("fuel_types")
      .select("*")
      .eq("active", true)
      .order("label", { ascending: true });

    if (error) throw error;
    res.json(fuelTypes || []);
  } catch (error: any) {
    console.error("Error fetching fuel types:", error);
    res.status(500).json({ error: error.message });
  }
});

// Get all orders for the authenticated customer
router.get("/orders", async (req, res) => {
  const user = (req as any).user;
  
  try {
    // Get customer ID from user ID
    const { data: customer, error: customerError } = await supabaseAdmin
      .from("customers")
      .select("id")
      .eq("user_id", user.id)
      .single();

    if (customerError) throw customerError;
    if (!customer) {
      return res.status(404).json({ error: "Customer profile not found" });
    }

    // Fetch orders with fuel type details
    const { data: orders, error: ordersError } = await supabaseAdmin
      .from("orders")
      .select(`
        *,
        fuel_types (
          id,
          code,
          label
        ),
        drivers (
          id,
          user_id,
          profiles (
            full_name,
            phone
          )
        )
      `)
      .eq("customer_id", customer.id)
      .order("created_at", { ascending: false });

    if (ordersError) throw ordersError;

    res.json(orders || []);
  } catch (error: any) {
    console.error("Error fetching orders:", error);
    res.status(500).json({ error: error.message });
  }
});

// Get single order details
router.get("/orders/:id", async (req, res) => {
  const user = (req as any).user;
  const orderId = req.params.id;

  try {
    // Get customer ID from user ID
    const { data: customer, error: customerError } = await supabaseAdmin
      .from("customers")
      .select("id")
      .eq("user_id", user.id)
      .single();

    if (customerError) throw customerError;
    if (!customer) {
      return res.status(404).json({ error: "Customer profile not found" });
    }

    // Fetch order with full details
    const { data: order, error: orderError } = await supabaseAdmin
      .from("orders")
      .select(`
        *,
        fuel_types (
          id,
          code,
          label
        ),
        drivers (
          id,
          user_id,
          profiles (
            full_name,
            phone
          )
        ),
        depots (
          id,
          name
        )
      `)
      .eq("id", orderId)
      .eq("customer_id", customer.id)
      .single();

    if (orderError) throw orderError;
    if (!order) {
      return res.status(404).json({ error: "Order not found" });
    }

    res.json(order);
  } catch (error: any) {
    console.error("Error fetching order:", error);
    res.status(500).json({ error: error.message });
  }
});

// Create new order
router.post("/orders", async (req, res) => {
  const user = (req as any).user;
  const {
    fuelTypeId,
    litres,
    dropLat,
    dropLng,
    timeWindow,
    selectedDepotId, // Optional: customer can select depot
  } = req.body;

  try {
    // Get customer ID from user ID
    const { data: customer, error: customerError } = await supabaseAdmin
      .from("customers")
      .select("id")
      .eq("user_id", user.id)
      .single();

    if (customerError) throw customerError;
    if (!customer) {
      return res.status(404).json({ error: "Customer profile not found" });
    }

    // Get fuel type pricing from depots
    let depotId = selectedDepotId;
    let priceCents = 2500; // Default price per litre (R25.00)

    if (selectedDepotId) {
      // Use selected depot price
      const { data: depotPrice } = await supabaseAdmin
        .from("depot_prices")
        .select("price_cents")
        .eq("depot_id", selectedDepotId)
        .eq("fuel_type_id", fuelTypeId)
        .single();

      if (depotPrice) {
        priceCents = depotPrice.price_cents;
      }
    } else {
      // Find nearest depot with this fuel type (simplified - just get first available)
      const { data: depotPrice } = await supabaseAdmin
        .from("depot_prices")
        .select("depot_id, price_cents")
        .eq("fuel_type_id", fuelTypeId)
        .limit(1)
        .single();

      if (depotPrice) {
        depotId = depotPrice.depot_id;
        priceCents = depotPrice.price_cents;
      }
    }

    // Calculate costs
    const fuelPriceCents = Math.round(parseFloat(litres) * priceCents);
    const deliveryFeeCents = 50000; // R500 delivery fee
    const serviceFeeCents = Math.round(fuelPriceCents * 0.05); // 5% service fee
    const totalCents = fuelPriceCents + deliveryFeeCents + serviceFeeCents;

    // Create order
    const { data: newOrder, error: orderError } = await supabaseAdmin
      .from("orders")
      .insert({
        customer_id: customer.id,
        fuel_type_id: fuelTypeId,
        litres: litres.toString(),
        drop_lat: dropLat,
        drop_lng: dropLng,
        time_window: timeWindow,
        fuel_price_cents: fuelPriceCents,
        delivery_fee_cents: deliveryFeeCents,
        service_fee_cents: serviceFeeCents,
        total_cents: totalCents,
        selected_depot_id: depotId,
        state: "created",
      })
      .select()
      .single();

    if (orderError) throw orderError;

    res.status(201).json(newOrder);
  } catch (error: any) {
    console.error("Error creating order:", error);
    res.status(500).json({ error: error.message });
  }
});

// Update order (customer can only update before payment)
router.patch("/orders/:id", async (req, res) => {
  const user = (req as any).user;
  const orderId = req.params.id;
  const {
    fuelTypeId,
    litres,
    dropLat,
    dropLng,
    timeWindow,
  } = req.body;

  try {
    // Get customer ID from user ID
    const { data: customer, error: customerError } = await supabaseAdmin
      .from("customers")
      .select("id")
      .eq("user_id", user.id)
      .single();

    if (customerError) throw customerError;
    if (!customer) {
      return res.status(404).json({ error: "Customer profile not found" });
    }

    // Check if order exists and belongs to customer
    const { data: existingOrder, error: orderCheckError } = await supabaseAdmin
      .from("orders")
      .select("*")
      .eq("id", orderId)
      .eq("customer_id", customer.id)
      .single();

    if (orderCheckError) throw orderCheckError;
    if (!existingOrder) {
      return res.status(404).json({ error: "Order not found" });
    }

    // Only allow updates for orders in "created" or "awaiting_payment" state
    if (!["created", "awaiting_payment"].includes(existingOrder.state)) {
      return res.status(400).json({ 
        error: "Order cannot be modified in current state" 
      });
    }

    let updateData: any = {
      updated_at: new Date().toISOString(),
    };

    // If fuel type or litres changed, recalculate pricing
    if (fuelTypeId || litres) {
      const newFuelTypeId = fuelTypeId || existingOrder.fuel_type_id;
      const newLitres = litres || existingOrder.litres;

      const { data: fuelType } = await supabaseAdmin
        .from("fuel_types")
        .select("*")
        .eq("id", newFuelTypeId)
        .single();

      if (fuelType) {
        const fuelPriceCents = Math.round(parseFloat(newLitres) * fuelType.price_cents);
        const deliveryFeeCents = 50000;
        const serviceFeeCents = Math.round(fuelPriceCents * 0.05);
        const totalCents = fuelPriceCents + deliveryFeeCents + serviceFeeCents;

        updateData = {
          ...updateData,
          fuel_type_id: newFuelTypeId,
          litres: newLitres.toString(),
          fuel_price_cents: fuelPriceCents,
          delivery_fee_cents: deliveryFeeCents,
          service_fee_cents: serviceFeeCents,
          total_cents: totalCents,
        };
      }
    }

    if (dropLat) updateData.drop_lat = dropLat;
    if (dropLng) updateData.drop_lng = dropLng;
    if (timeWindow) updateData.time_window = timeWindow;

    // Update order
    const { data: updatedOrder, error: updateError } = await supabaseAdmin
      .from("orders")
      .update(updateData)
      .eq("id", orderId)
      .select()
      .single();

    if (updateError) throw updateError;

    res.json(updatedOrder);
  } catch (error: any) {
    console.error("Error updating order:", error);
    res.status(500).json({ error: error.message });
  }
});

// Cancel order
router.delete("/orders/:id", async (req, res) => {
  const user = (req as any).user;
  const orderId = req.params.id;

  try {
    // Get customer ID from user ID
    const { data: customer, error: customerError } = await supabaseAdmin
      .from("customers")
      .select("id")
      .eq("user_id", user.id)
      .single();

    if (customerError) throw customerError;
    if (!customer) {
      return res.status(404).json({ error: "Customer profile not found" });
    }

    // Check if order exists and belongs to customer
    const { data: existingOrder, error: orderCheckError } = await supabaseAdmin
      .from("orders")
      .select("*")
      .eq("id", orderId)
      .eq("customer_id", customer.id)
      .single();

    if (orderCheckError) throw orderCheckError;
    if (!existingOrder) {
      return res.status(404).json({ error: "Order not found" });
    }

    // Only allow cancellation for certain states
    if (["delivered", "cancelled", "refunded"].includes(existingOrder.state)) {
      return res.status(400).json({ 
        error: "Order cannot be cancelled in current state" 
      });
    }

    // Update order state to cancelled
    const { data: cancelledOrder, error: cancelError } = await supabaseAdmin
      .from("orders")
      .update({ 
        state: "cancelled",
        updated_at: new Date().toISOString()
      })
      .eq("id", orderId)
      .select()
      .single();

    if (cancelError) throw cancelError;

    res.json(cancelledOrder);
  } catch (error: any) {
    console.error("Error cancelling order:", error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
