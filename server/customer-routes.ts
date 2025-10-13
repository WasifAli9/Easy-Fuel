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
    deliveryAddressId,
    fromTime,
    toTime,
    priorityLevel,
    accessInstructions,
    vehicleRegistration,
    equipmentType,
    tankCapacity,
    paymentMethodId,
    termsAccepted,
    signatureData,
    selectedDepotId,
  } = req.body;

  try {
    // Validate required inputs
    if (!fuelTypeId) {
      return res.status(400).json({ error: "Fuel type is required" });
    }

    const litresNum = parseFloat(litres);
    if (isNaN(litresNum) || litresNum <= 0) {
      return res.status(400).json({ error: "Invalid litres value" });
    }

    if (!termsAccepted) {
      return res.status(400).json({ error: "Terms and conditions must be accepted" });
    }

    // Validate tank capacity if provided
    if (tankCapacity) {
      const capacity = parseFloat(tankCapacity);
      if (isNaN(capacity) || capacity <= 0) {
        return res.status(400).json({ error: "Tank capacity must be a valid positive number" });
      }
    }

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

    // Get delivery address details if provided
    let lat, lng;
    if (deliveryAddressId) {
      const { data: address, error: addressError } = await supabaseAdmin
        .from("delivery_addresses")
        .select("lat, lng")
        .eq("id", deliveryAddressId)
        .eq("customer_id", customer.id)
        .single();

      if (addressError || !address) {
        return res.status(400).json({ error: "Invalid delivery address" });
      }

      lat = address.lat;
      lng = address.lng;
    } else {
      return res.status(400).json({ error: "Delivery address is required" });
    }

    // Get fuel type pricing from depot
    let depotId = selectedDepotId;
    let priceCents = 2500; // Default price per litre (R25.00)

    if (selectedDepotId) {
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
    const fuelPriceCents = Math.round(litresNum * priceCents);
    const deliveryFeeCents = 50000; // R500 delivery fee
    const serviceFeeCents = Math.round(fuelPriceCents * 0.05); // 5% service fee
    const totalCents = fuelPriceCents + deliveryFeeCents + serviceFeeCents;

    // Create order with all new fields
    const { data: newOrder, error: orderError } = await supabaseAdmin
      .from("orders")
      .insert({
        customer_id: customer.id,
        fuel_type_id: fuelTypeId,
        litres: litresNum.toString(),
        
        // Delivery details
        delivery_address_id: deliveryAddressId,
        drop_lat: lat,
        drop_lng: lng,
        access_instructions: accessInstructions || null,
        from_time: fromTime || null,
        to_time: toTime || null,
        priority_level: priorityLevel || "medium",
        
        // Vehicle/Equipment
        vehicle_registration: vehicleRegistration || null,
        equipment_type: equipmentType || null,
        tank_capacity: tankCapacity ? parseFloat(tankCapacity) : null,
        
        // Payment and Legal
        payment_method_id: paymentMethodId || null,
        terms_accepted: termsAccepted,
        terms_accepted_at: termsAccepted ? new Date().toISOString() : null,
        signature_data: signatureData || null,
        
        // Pricing
        fuel_price_cents: fuelPriceCents,
        delivery_fee_cents: deliveryFeeCents,
        service_fee_cents: serviceFeeCents,
        total_cents: totalCents,
        
        // Order management
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
      const newLitres = parseFloat(litres || existingOrder.litres);

      if (isNaN(newLitres) || newLitres <= 0) {
        return res.status(400).json({ error: "Invalid litres value" });
      }

      // Get fuel type pricing from depot (use existing depot or find new one)
      let priceCents = 2500; // Default price per litre (R25.00)
      const depotId = existingOrder.selected_depot_id;

      if (depotId) {
        const { data: depotPrice } = await supabaseAdmin
          .from("depot_prices")
          .select("price_cents")
          .eq("depot_id", depotId)
          .eq("fuel_type_id", newFuelTypeId)
          .single();

        if (depotPrice) {
          priceCents = depotPrice.price_cents;
        }
      } else {
        // Find a depot with this fuel type
        const { data: depotPrice } = await supabaseAdmin
          .from("depot_prices")
          .select("price_cents")
          .eq("fuel_type_id", newFuelTypeId)
          .limit(1)
          .single();

        if (depotPrice) {
          priceCents = depotPrice.price_cents;
        }
      }

      const fuelPriceCents = Math.round(newLitres * priceCents);
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

    if (dropLat !== undefined) {
      const lat = parseFloat(dropLat);
      if (isNaN(lat)) {
        return res.status(400).json({ error: "Invalid latitude value" });
      }
      updateData.drop_lat = lat;
    }
    
    if (dropLng !== undefined) {
      const lng = parseFloat(dropLng);
      if (isNaN(lng)) {
        return res.status(400).json({ error: "Invalid longitude value" });
      }
      updateData.drop_lng = lng;
    }
    
    if (timeWindow !== undefined) updateData.time_window = timeWindow;

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

    // Only allow cancellation for orders that haven't been picked up yet
    const nonCancellableStates = ["delivered", "cancelled", "refunded", "picked_up", "en_route"];
    if (nonCancellableStates.includes(existingOrder.state)) {
      return res.status(400).json({ 
        error: "Order cannot be cancelled - already in progress or completed" 
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

// === DELIVERY ADDRESSES ENDPOINTS ===

// Get all delivery addresses for the authenticated customer
router.get("/delivery-addresses", async (req, res) => {
  const user = (req as any).user;
  
  try {
    const { data: customer, error: customerError } = await supabaseAdmin
      .from("customers")
      .select("id")
      .eq("user_id", user.id)
      .single();

    if (customerError) throw customerError;
    if (!customer) {
      return res.status(404).json({ error: "Customer profile not found" });
    }

    const { data: addresses, error } = await supabaseAdmin
      .from("delivery_addresses")
      .select("*")
      .eq("customer_id", customer.id)
      .order("is_default", { ascending: false })
      .order("created_at", { ascending: false });

    if (error) throw error;
    res.json(addresses || []);
  } catch (error: any) {
    console.error("Error fetching delivery addresses:", error);
    res.status(500).json({ error: error.message });
  }
});

// Create a new delivery address
router.post("/delivery-addresses", async (req, res) => {
  const user = (req as any).user;
  
  try {
    const { data: customer, error: customerError } = await supabaseAdmin
      .from("customers")
      .select("id")
      .eq("user_id", user.id)
      .single();

    if (customerError) throw customerError;
    if (!customer) {
      return res.status(404).json({ error: "Customer profile not found" });
    }

    const { 
      label, 
      addressStreet, 
      addressCity, 
      addressProvince, 
      addressPostalCode, 
      addressCountry,
      lat,
      lng,
      accessInstructions,
      isDefault 
    } = req.body;

    // If this is being set as default, unset other defaults
    if (isDefault) {
      await supabaseAdmin
        .from("delivery_addresses")
        .update({ is_default: false })
        .eq("customer_id", customer.id);
    }

    const { data: newAddress, error } = await supabaseAdmin
      .from("delivery_addresses")
      .insert({
        customer_id: customer.id,
        label,
        address_street: addressStreet,
        address_city: addressCity,
        address_province: addressProvince,
        address_postal_code: addressPostalCode,
        address_country: addressCountry || "South Africa",
        lat,
        lng,
        access_instructions: accessInstructions,
        is_default: isDefault || false,
        verification_status: "pending"
      })
      .select()
      .single();

    if (error) throw error;
    res.json(newAddress);
  } catch (error: any) {
    console.error("Error creating delivery address:", error);
    res.status(500).json({ error: error.message });
  }
});

// Update a delivery address
router.patch("/delivery-addresses/:id", async (req, res) => {
  const user = (req as any).user;
  const addressId = req.params.id;
  
  try {
    const { data: customer, error: customerError } = await supabaseAdmin
      .from("customers")
      .select("id")
      .eq("user_id", user.id)
      .single();

    if (customerError) throw customerError;
    if (!customer) {
      return res.status(404).json({ error: "Customer profile not found" });
    }

    const { 
      label, 
      addressStreet, 
      addressCity, 
      addressProvince, 
      addressPostalCode,
      addressCountry, 
      lat,
      lng,
      accessInstructions,
      isDefault 
    } = req.body;

    // If setting as default, unset other defaults
    if (isDefault) {
      await supabaseAdmin
        .from("delivery_addresses")
        .update({ is_default: false })
        .eq("customer_id", customer.id)
        .neq("id", addressId);
    }

    const updateData: any = { updated_at: new Date().toISOString() };
    if (label !== undefined) updateData.label = label;
    if (addressStreet !== undefined) updateData.address_street = addressStreet;
    if (addressCity !== undefined) updateData.address_city = addressCity;
    if (addressProvince !== undefined) updateData.address_province = addressProvince;
    if (addressPostalCode !== undefined) updateData.address_postal_code = addressPostalCode;
    if (addressCountry !== undefined) updateData.address_country = addressCountry;
    if (lat !== undefined) updateData.lat = lat;
    if (lng !== undefined) updateData.lng = lng;
    if (accessInstructions !== undefined) updateData.access_instructions = accessInstructions;
    if (isDefault !== undefined) updateData.is_default = isDefault;

    const { data: updatedAddress, error } = await supabaseAdmin
      .from("delivery_addresses")
      .update(updateData)
      .eq("id", addressId)
      .eq("customer_id", customer.id)
      .select()
      .single();

    if (error) throw error;
    if (!updatedAddress) {
      return res.status(404).json({ error: "Address not found" });
    }

    res.json(updatedAddress);
  } catch (error: any) {
    console.error("Error updating delivery address:", error);
    res.status(500).json({ error: error.message });
  }
});

// Delete a delivery address
router.delete("/delivery-addresses/:id", async (req, res) => {
  const user = (req as any).user;
  const addressId = req.params.id;
  
  try {
    const { data: customer, error: customerError } = await supabaseAdmin
      .from("customers")
      .select("id")
      .eq("user_id", user.id)
      .single();

    if (customerError) throw customerError;
    if (!customer) {
      return res.status(404).json({ error: "Customer profile not found" });
    }

    const { error } = await supabaseAdmin
      .from("delivery_addresses")
      .delete()
      .eq("id", addressId)
      .eq("customer_id", customer.id);

    if (error) throw error;
    res.json({ success: true });
  } catch (error: any) {
    console.error("Error deleting delivery address:", error);
    res.status(500).json({ error: error.message });
  }
});

// === PAYMENT METHODS ENDPOINTS ===

// Get all payment methods for the authenticated customer
router.get("/payment-methods", async (req, res) => {
  const user = (req as any).user;
  
  try {
    const { data: customer, error: customerError } = await supabaseAdmin
      .from("customers")
      .select("id")
      .eq("user_id", user.id)
      .single();

    if (customerError) throw customerError;
    if (!customer) {
      return res.status(404).json({ error: "Customer profile not found" });
    }

    const { data: paymentMethods, error } = await supabaseAdmin
      .from("payment_methods")
      .select("*")
      .eq("customer_id", customer.id)
      .eq("is_active", true)
      .order("is_default", { ascending: false })
      .order("created_at", { ascending: false });

    if (error) throw error;
    res.json(paymentMethods || []);
  } catch (error: any) {
    console.error("Error fetching payment methods:", error);
    res.status(500).json({ error: error.message });
  }
});

// Create a new payment method
router.post("/payment-methods", async (req, res) => {
  const user = (req as any).user;
  
  try {
    const { data: customer, error: customerError } = await supabaseAdmin
      .from("customers")
      .select("id")
      .eq("user_id", user.id)
      .single();

    if (customerError) throw customerError;
    if (!customer) {
      return res.status(404).json({ error: "Customer profile not found" });
    }

    const { 
      methodType, 
      label, 
      bankName,
      accountHolderName,
      accountNumber,
      branchCode,
      accountType,
      cardLastFour,
      cardBrand,
      cardExpiryMonth,
      cardExpiryYear,
      paymentGatewayToken,
      isDefault 
    } = req.body;

    // If setting as default, unset other defaults
    if (isDefault) {
      await supabaseAdmin
        .from("payment_methods")
        .update({ is_default: false })
        .eq("customer_id", customer.id);
    }

    const { data: newPaymentMethod, error } = await supabaseAdmin
      .from("payment_methods")
      .insert({
        customer_id: customer.id,
        method_type: methodType,
        label,
        bank_name: bankName,
        account_holder_name: accountHolderName,
        account_number: accountNumber,
        branch_code: branchCode,
        account_type: accountType,
        card_last_four: cardLastFour,
        card_brand: cardBrand,
        card_expiry_month: cardExpiryMonth,
        card_expiry_year: cardExpiryYear,
        payment_gateway_token: paymentGatewayToken,
        is_default: isDefault || false,
        is_active: true
      })
      .select()
      .single();

    if (error) throw error;
    res.json(newPaymentMethod);
  } catch (error: any) {
    console.error("Error creating payment method:", error);
    res.status(500).json({ error: error.message });
  }
});

// Delete a payment method
router.delete("/payment-methods/:id", async (req, res) => {
  const user = (req as any).user;
  const paymentMethodId = req.params.id;
  
  try {
    const { data: customer, error: customerError } = await supabaseAdmin
      .from("customers")
      .select("id")
      .eq("user_id", user.id)
      .single();

    if (customerError) throw customerError;
    if (!customer) {
      return res.status(404).json({ error: "Customer profile not found" });
    }

    // Soft delete by marking as inactive
    const { error } = await supabaseAdmin
      .from("payment_methods")
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq("id", paymentMethodId)
      .eq("customer_id", customer.id);

    if (error) throw error;
    res.json({ success: true });
  } catch (error: any) {
    console.error("Error deleting payment method:", error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
