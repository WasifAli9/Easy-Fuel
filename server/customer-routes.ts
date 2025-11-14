import { Router } from "express";
import { supabaseAdmin } from "./supabase";
import { createDispatchOffers } from "./dispatch-service";
import { sendDriverAcceptanceEmail } from "./email-service";
import { websocketService } from "./websocket";
import { pushNotificationService } from "./push-service";
import { ensureChatThreadForAssignment } from "./chat-service";
import { orderNotifications, offerNotifications } from "./notification-helpers";

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

    // Fetch orders with fuel type and delivery address details
    const { data: orders, error: ordersError } = await supabaseAdmin
      .from("orders")
      .select(`
        *,
        fuel_types (
          id,
          code,
          label
        ),
        delivery_addresses (
          id,
          label,
          address_street,
          address_city,
          address_province,
          address_postal_code
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
        ),
        delivery_addresses (
          id,
          label,
          address_street,
          address_city,
          address_province,
          address_postal_code
        )
      `)
      .eq("id", orderId)
      .eq("customer_id", customer.id)
      .single();

    if (orderError) throw orderError;
    if (!order) {
      return res.status(404).json({ error: "Order not found" });
    }

    // If driver is assigned, fetch driver details
    if (order.assigned_driver_id) {
      const { data: driver, error: driverError } = await supabaseAdmin
        .from("drivers")
        .select("user_id")
        .eq("id", order.assigned_driver_id)
        .single();

      if (!driverError && driver) {
        // Get driver profile for name and phone
        const { data: driverProfile } = await supabaseAdmin
          .from("profiles")
          .select("full_name, phone")
          .eq("id", driver.user_id)
          .single();

        if (driverProfile) {
          order.driver_details = driverProfile;
        }
      }
    }

    res.json(order);
  } catch (error: any) {
    console.error("Error fetching order:", error);
    res.status(500).json({ error: error.message });
  }
});

// Get dispatch offers (driver quotes) for an order
router.get("/orders/:id/offers", async (req, res) => {
  const user = (req as any).user;
  const orderId = req.params.id;

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

    // Ensure order belongs to customer
    const { data: orderCheck, error: orderCheckError } = await supabaseAdmin
      .from("orders")
      .select("id")
      .eq("id", orderId)
      .eq("customer_id", customer.id)
      .maybeSingle();

    if (orderCheckError) throw orderCheckError;
    if (!orderCheck) {
      return res.status(404).json({ error: "Order not found" });
    }

    const { data: offers, error: offersError } = await supabaseAdmin
      .from("dispatch_offers")
      .select("id, driver_id, state, proposed_delivery_time, proposed_price_per_km_cents, proposed_notes, created_at, updated_at, customer_response_at")
      .eq("order_id", orderId)
      .in("state", ["pending_customer", "customer_accepted", "customer_declined"])
      .not("proposed_price_per_km_cents", "is", null)
      .order("created_at", { ascending: false });

    if (offersError) throw offersError;

    if (!offers || offers.length === 0) {
      return res.json([]);
    }

    const driverIds = Array.from(new Set(offers.map((offer: any) => offer.driver_id)));
    const { data: drivers, error: driversError } = await supabaseAdmin
      .from("drivers")
      .select("id, user_id, vehicle_capacity_litres, premium_status")
      .in("id", driverIds);

    if (driversError) throw driversError;

    const driverUserIds = Array.from(new Set(drivers?.map((driver: any) => driver.user_id) || []));
    const { data: profiles, error: profilesError } = await supabaseAdmin
      .from("profiles")
      .select("id, full_name, phone")
      .in("id", driverUserIds.length > 0 ? driverUserIds : ["00000000-0000-0000-0000-000000000000"]);

    if (profilesError) throw profilesError;

    // Get order to fetch fuel_type_id for driver pricing lookup
    const { data: orderForPricing } = await supabaseAdmin
      .from("orders")
      .select("fuel_type_id, selected_depot_id, drop_lat, drop_lng, litres")
      .eq("id", orderId)
      .single();

    // Fetch driver pricing for all drivers and the order's fuel type
    let driverPricingMap = new Map();
    if (orderForPricing?.fuel_type_id && driverIds.length > 0) {
      const { data: driverPricing } = await supabaseAdmin
        .from("driver_pricing")
        .select("driver_id, fuel_price_per_liter_cents")
        .eq("fuel_type_id", orderForPricing.fuel_type_id)
        .in("driver_id", driverIds)
        .eq("active", true);

      if (driverPricing) {
        driverPricingMap = new Map(
          driverPricing.map((p: any) => [p.driver_id, p.fuel_price_per_liter_cents])
        );
      }
    }

    // Calculate distance if depot is available
    let distanceKm = 0;
    if (orderForPricing?.selected_depot_id && orderForPricing?.drop_lat && orderForPricing?.drop_lng) {
      const { data: depot } = await supabaseAdmin
        .from("depots")
        .select("lat, lng")
        .eq("id", orderForPricing.selected_depot_id)
        .single();

      if (depot) {
        const { calculateDistance, milesToKm } = await import("./utils/distance");
        const distanceMiles = calculateDistance(
          depot.lat,
          depot.lng,
          orderForPricing.drop_lat,
          orderForPricing.drop_lng
        );
        distanceKm = milesToKm(distanceMiles);
      }
    }

    const driverMap = new Map((drivers || []).map((driver: any) => [driver.id, driver]));
    const profileMap = new Map((profiles || []).map((profile: any) => [profile.id, profile]));

    const formattedOffers = offers.map((offer: any) => {
      const driver = driverMap.get(offer.driver_id);
      const profile = driver ? profileMap.get(driver.user_id) : null;
      const fuelPricePerLiterCents = driverPricingMap.get(offer.driver_id) || 0;

      // Calculate estimated pricing for this quote
      const litres = parseFloat(orderForPricing?.litres || 0);
      const fuelCost = (fuelPricePerLiterCents / 100) * litres;
      const pricePerKmRands = (offer.proposed_price_per_km_cents || 0) / 100;
      const deliveryFee = pricePerKmRands * distanceKm;
      const total = fuelCost + deliveryFee;

      return {
        ...offer,
        driver: driver
          ? {
              id: driver.id,
              premiumStatus: driver.premium_status,
              vehicleCapacityLitres: driver.vehicle_capacity_litres,
              profile: profile
                ? {
                    fullName: profile.full_name,
                    phone: profile.phone,
                  }
                : null,
            }
          : null,
        estimatedPricing: {
          fuelPricePerLiterCents,
          fuelCost,
          deliveryFee,
          distanceKm,
          total,
        },
      };
    });

    res.json(formattedOffers);
  } catch (error: any) {
    console.error("Error fetching order offers:", error);
    res.status(500).json({ error: error.message });
  }
});

// Customer accepts a driver quote
router.post("/orders/:id/offers/:offerId/accept", async (req, res) => {
  const user = (req as any).user;
  const orderId = req.params.id;
  const offerId = req.params.offerId;

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

    const { data: order, error: orderError } = await supabaseAdmin
      .from("orders")
      .select("*")
      .eq("id", orderId)
      .eq("customer_id", customer.id)
      .single();

    if (orderError) throw orderError;
    if (!order) {
      return res.status(404).json({ error: "Order not found" });
    }

    if (order.state !== "created" && order.state !== "awaiting_payment") {
      return res.status(409).json({ error: "Order can no longer accept driver quotes" });
    }

    const { data: offer, error: offerError } = await supabaseAdmin
      .from("dispatch_offers")
      .select("*")
      .eq("id", offerId)
      .eq("order_id", orderId)
      .single();

    if (offerError) throw offerError;
    if (!offer) {
      return res.status(404).json({ error: "Offer not found" });
    }

    if (offer.state !== "pending_customer") {
      return res.status(409).json({ error: "This offer has already been actioned" });
    }

    const nowIso = new Date().toISOString();
    
    // Get driver's fuel price per liter for this fuel type
    const { data: driverPricing, error: pricingError } = await supabaseAdmin
      .from("driver_pricing")
      .select("fuel_price_per_liter_cents")
      .eq("driver_id", offer.driver_id)
      .eq("fuel_type_id", order.fuel_type_id)
      .eq("active", true)
      .maybeSingle();

    if (pricingError) throw pricingError;
    
    const fuelPricePerLiterCents = driverPricing?.fuel_price_per_liter_cents || 0;
    const pricePerKmCents = Number(offer.proposed_price_per_km_cents) || 0;
    const litres = Number(order.litres) || 0;
    
    // Calculate distance from depot to drop location
    let distanceKm = 0;
    if (order.selected_depot_id) {
      const { data: depot, error: depotError } = await supabaseAdmin
        .from("depots")
        .select("lat, lng")
        .eq("id", order.selected_depot_id)
        .single();
      
      if (!depotError && depot) {
        const { calculateDistance, milesToKm } = await import("./utils/distance");
        const distanceMiles = calculateDistance(
          depot.lat,
          depot.lng,
          order.drop_lat,
          order.drop_lng
        );
        distanceKm = milesToKm(distanceMiles);
      }
    }
    
    // Calculate total: (fuel_price_per_liter * litres) + (price_per_km * distance_km)
    const fuelCostCents = Math.round(fuelPricePerLiterCents * litres);
    const deliveryFeeCents = Math.round(pricePerKmCents * distanceKm);
    const serviceFee = Number(order.service_fee_cents) || 0;
    const totalCents = fuelCostCents + deliveryFeeCents + serviceFee;

    const { data: updatedOrder, error: updateOrderError } = await supabaseAdmin
      .from("orders")
      .update({
        state: "assigned",
        assigned_driver_id: offer.driver_id,
        confirmed_delivery_time: offer.proposed_delivery_time,
        fuel_price_cents: fuelPricePerLiterCents,
        delivery_fee_cents: deliveryFeeCents,
        total_cents: totalCents,
        updated_at: nowIso,
      })
      .eq("id", orderId)
      .eq("customer_id", customer.id)
      .in("state", ["created", "awaiting_payment"])
      .select(`
        *,
        customers (
          user_id,
          company_name
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
      .single();

    if (updateOrderError || !updatedOrder) {
      return res.status(409).json({ error: "Failed to assign driver. Please refresh and try again." });
    }

    const { error: selectedOfferError } = await supabaseAdmin
      .from("dispatch_offers")
      .update({
        state: "customer_accepted",
        customer_response_at: nowIso,
        updated_at: nowIso,
      })
      .eq("id", offerId);

    if (selectedOfferError) {
      console.error("Error updating selected offer:", selectedOfferError);
    }

    // Get all other offers that will be declined
    const { data: otherOffers } = await supabaseAdmin
      .from("dispatch_offers")
      .select("driver_id")
      .eq("order_id", orderId)
      .neq("id", offerId)
      .in("state", ["pending_customer", "offered"]);

    const { error: otherOffersError } = await supabaseAdmin
      .from("dispatch_offers")
      .update({
        state: "customer_declined",
        customer_response_at: nowIso,
        updated_at: nowIso,
      })
      .eq("order_id", orderId)
      .neq("id", offerId)
      .in("state", ["pending_customer", "offered"]);

    if (otherOffersError) {
      console.error("Error updating other offers:", otherOffersError);
    }

    // Notify drivers whose quotes were declined
    if (otherOffers && otherOffers.length > 0) {
      const declinedDriverIds = otherOffers.map((o: any) => o.driver_id);
      const { data: declinedDrivers } = await supabaseAdmin
        .from("drivers")
        .select("id, user_id")
        .in("id", declinedDriverIds);

      for (const driver of declinedDrivers || []) {
        if (driver.user_id) {
          await offerNotifications.onCustomerDeclined(driver.user_id, offerId);
        }
      }
    }

    // Fetch driver profile for notifications
    const { data: driverRecord, error: driverLookupError } = await supabaseAdmin
      .from("drivers")
      .select("id, user_id")
      .eq("id", offer.driver_id)
      .single();

    if (driverLookupError) throw driverLookupError;

    const driverUserId = driverRecord?.user_id;
    let driverProfileName = "Driver";

    let driverProfilePhone: string | null = null;
    if (driverUserId) {
      const { data: driverProfile } = await supabaseAdmin
        .from("profiles")
        .select("full_name, phone")
        .eq("id", driverUserId)
        .maybeSingle();
      if (driverProfile?.full_name) {
        driverProfileName = driverProfile.full_name;
      }
      if (driverProfile?.phone) {
        driverProfilePhone = driverProfile.phone;
      }
    }

    const customerUserId = updatedOrder.customers?.user_id || user.id;
    let customerEmail: string | null = null;
    let customerName =
      updatedOrder.customers?.company_name ||
      updatedOrder.customers?.full_name ||
      "Customer";

    if (customerUserId) {
      const { data: customerProfile } = await supabaseAdmin
        .from("profiles")
        .select("email, full_name")
        .eq("id", customerUserId)
        .maybeSingle();
      if (customerProfile?.email) {
        customerEmail = customerProfile.email;
      }
      if (customerProfile?.full_name) {
        customerName = customerProfile.full_name;
      }
    }

    const chatThread = await ensureChatThreadForAssignment({
      orderId,
      customerId: updatedOrder.customer_id,
      driverId: offer.driver_id,
      customerUserId,
      driverUserId,
    });

    // Notify both driver and customer using helper functions
    if (driverUserId) {
      await orderNotifications.onDriverAssigned(
        customerUserId,
        driverUserId,
        orderId,
        driverProfileName,
        driverProfilePhone || "Not available"
      );
    } else {
      console.warn(`[Customer Accept Quote] No driverUserId found for driver ${offer.driver_id}`);
    }

    // Send confirmation email to customer
    if (customerEmail) {
      const deliveryAddress = updatedOrder.delivery_addresses
        ? `${updatedOrder.delivery_addresses.address_street}, ${updatedOrder.delivery_addresses.address_city}, ${updatedOrder.delivery_addresses.address_province}`
        : `${updatedOrder.drop_lat}, ${updatedOrder.drop_lng}`;

      const confirmedTime = offer.proposed_delivery_time
        ? new Date(offer.proposed_delivery_time).toLocaleString("en-ZA", {
            dateStyle: "medium",
            timeStyle: "short",
            timeZone: "Africa/Johannesburg",
          })
        : "Not specified";

      sendDriverAcceptanceEmail({
        customerEmail,
        customerName,
        orderNumber: updatedOrder.id.substring(0, 8).toUpperCase(),
        driverName: driverProfileName,
        driverPhone: driverProfilePhone || "Not available",
        confirmedDeliveryTime: confirmedTime,
        fuelType: updatedOrder.fuel_types?.label || "Fuel",
        litres: String(updatedOrder.litres),
        deliveryAddress,
      }).catch((error: any) => {
        console.error("Error sending driver acceptance email:", error);
      });
    }

    res.json({
      success: true,
      message: "Driver assigned successfully",
      orderId,
    });
  } catch (error: any) {
    console.error("Error accepting driver offer:", error);
    res.status(500).json({ error: error.message || "Failed to accept driver offer" });
  }
});

// Create new order
router.post("/orders", async (req, res) => {
  const user = (req as any).user;
  const {
    fuelTypeId,
    litres,
    maxBudgetCents,
    deliveryAddressId,
    deliveryDate,
    fromTime,
    toTime,
    accessNotes,
    priorityLevel,
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

    // Get depot ID for order tracking (pricing will be calculated when driver offer is accepted)
    let depotId = selectedDepotId;

    if (!selectedDepotId) {
      // Find a depot that has this fuel type
      const { data: depotPrice } = await supabaseAdmin
        .from("depot_prices")
        .select("depot_id")
        .eq("fuel_type_id", fuelTypeId)
        .limit(1)
        .single();

      if (depotPrice) {
        depotId = depotPrice.depot_id;
      }
    }

    // Pricing will be calculated when customer accepts a driver's offer
    // Set to 0 as placeholder (marketplace model - drivers compete with their delivery fees)
    const fuelPriceCents = 0;
    const deliveryFeeCents = 0;
    const serviceFeeCents = 0;
    const totalCents = 0;

    // Convert time strings (HH:MM) to full timestamps (South African timezone SAST = UTC+2)
    // Only create timestamps if we have a delivery date - otherwise leave as null
    let fromTimeTimestamp = null;
    let toTimeTimestamp = null;
    
    if (fromTime && deliveryDate) {
      // Validate HH:MM format
      if (!/^\d{2}:\d{2}$/.test(fromTime)) {
        return res.status(400).json({ error: "Invalid from time format. Expected HH:MM" });
      }
      // Parse with SAST offset (+02:00) and convert to ISO string for proper round-tripping
      const fromDateTime = new Date(`${deliveryDate}T${fromTime}:00+02:00`);
      fromTimeTimestamp = fromDateTime.toISOString();
    }
    
    if (toTime && deliveryDate) {
      // Validate HH:MM format
      if (!/^\d{2}:\d{2}$/.test(toTime)) {
        return res.status(400).json({ error: "Invalid to time format. Expected HH:MM" });
      }
      // Parse with SAST offset (+02:00) and convert to ISO string for proper round-tripping
      const toDateTime = new Date(`${deliveryDate}T${toTime}:00+02:00`);
      toTimeTimestamp = toDateTime.toISOString();
    }

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
        access_instructions: accessNotes || null,
        delivery_date: deliveryDate || null,
        from_time: fromTimeTimestamp,
        to_time: toTimeTimestamp,
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
        // Note: max_budget_cents column doesn't exist in database, removed from insert
        
        // Order management
        selected_depot_id: depotId,
        state: "created",
      })
      .select()
      .single();

    if (orderError) throw orderError;

    // Create dispatch offers for drivers (async, don't wait)
    createDispatchOffers({
      orderId: newOrder.id,
      fuelTypeId: newOrder.fuel_type_id,
      dropLat: lat,
      dropLng: lng,
      litres: litresNum,
      maxBudgetCents: maxBudgetCents || null,
    })
    .catch(error => {
      console.error(`[Order Created] Error creating dispatch offers for order ${newOrder.id}:`, error);
    });

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

    // If fuel type or litres changed, update them but DON'T recalculate pricing
    // Pricing is calculated only when customer accepts a driver's offer (marketplace model)
    if (fuelTypeId || litres) {
      const newFuelTypeId = fuelTypeId || existingOrder.fuel_type_id;
      const newLitres = parseFloat(litres || existingOrder.litres);

      if (isNaN(newLitres) || newLitres <= 0) {
        return res.status(400).json({ error: "Invalid litres value" });
      }

      updateData = {
        ...updateData,
        fuel_type_id: newFuelTypeId,
        litres: newLitres.toString(),
        // Keep pricing at 0 until driver offer is accepted
        fuel_price_cents: 0,
        delivery_fee_cents: 0,
        service_fee_cents: 0,
        total_cents: 0,
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
        is_default: isDefault || false
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

    if (error) {
      // Handle schema cache issues - return empty array
      if (error.code === 'PGRST205' || error.code === 'PGRST204') {
        console.log("Schema cache not refreshed yet for payment_methods, returning empty array");
        return res.json([]);
      }
      throw error;
    }
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

// ============== DELIVERY ADDRESSES ==============

// Get all delivery addresses for the authenticated customer
router.get("/addresses", async (req, res) => {
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
    console.error("Error fetching addresses:", error);
    res.status(500).json({ error: error.message });
  }
});

// Get single delivery address
router.get("/addresses/:id", async (req, res) => {
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

    const { data: address, error } = await supabaseAdmin
      .from("delivery_addresses")
      .select("*")
      .eq("id", addressId)
      .eq("customer_id", customer.id)
      .single();

    if (error) {
      // PGRST116 = "not found" error from Supabase/PostgREST
      if (error.code === 'PGRST116') {
        return res.status(404).json({ error: "Address not found" });
      }
      throw error;
    }
    if (!address) {
      return res.status(404).json({ error: "Address not found" });
    }

    res.json(address);
  } catch (error: any) {
    console.error("Error fetching address:", error);
    res.status(500).json({ error: error.message });
  }
});

// Create new delivery address
router.post("/addresses", async (req, res) => {
  const user = (req as any).user;
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

    // If setting as default, unset other defaults
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
        is_default: isDefault || false
      })
      .select()
      .single();

    if (error) throw error;
    res.json(newAddress);
  } catch (error: any) {
    console.error("Error creating address:", error);
    res.status(500).json({ error: error.message });
  }
});

// Update delivery address
router.put("/addresses/:id", async (req, res) => {
  const user = (req as any).user;
  const addressId = req.params.id;
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

    // If setting as default, unset other defaults
    if (isDefault) {
      await supabaseAdmin
        .from("delivery_addresses")
        .update({ is_default: false })
        .eq("customer_id", customer.id);
    }

    const { data: updatedAddress, error } = await supabaseAdmin
      .from("delivery_addresses")
      .update({
        label,
        address_street: addressStreet,
        address_city: addressCity,
        address_province: addressProvince,
        address_postal_code: addressPostalCode,
        address_country: addressCountry,
        lat,
        lng,
        access_instructions: accessInstructions,
        is_default: isDefault,
        updated_at: new Date().toISOString()
      })
      .eq("id", addressId)
      .eq("customer_id", customer.id)
      .select()
      .single();

    if (error) {
      // PGRST116 = "not found" error from Supabase/PostgREST
      if (error.code === 'PGRST116') {
        return res.status(404).json({ error: "Address not found" });
      }
      throw error;
    }
    if (!updatedAddress) {
      return res.status(404).json({ error: "Address not found" });
    }

    res.json(updatedAddress);
  } catch (error: any) {
    console.error("Error updating address:", error);
    res.status(500).json({ error: error.message });
  }
});

// Delete delivery address
router.delete("/addresses/:id", async (req, res) => {
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

    // First check if address exists
    const { data: existingAddress, error: checkError } = await supabaseAdmin
      .from("delivery_addresses")
      .select("id")
      .eq("id", addressId)
      .eq("customer_id", customer.id)
      .single();

    if (checkError) {
      // PGRST116 = "not found" error from Supabase/PostgREST
      if (checkError.code === 'PGRST116') {
        return res.status(404).json({ error: "Address not found" });
      }
      throw checkError;
    }

    const { error } = await supabaseAdmin
      .from("delivery_addresses")
      .delete()
      .eq("id", addressId)
      .eq("customer_id", customer.id);

    if (error) throw error;
    res.json({ success: true });
  } catch (error: any) {
    console.error("Error deleting address:", error);
    res.status(500).json({ error: error.message });
  }
});

// ============== CUSTOMER PROFILE ==============

// Get customer profile
router.get("/profile", async (req, res) => {
  const user = (req as any).user;
  
  try {
    const { data: profile, error: profileError } = await supabaseAdmin
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .maybeSingle();

    if (profileError) {
      // If it's an API key error, it means the key is invalid
      if (profileError.message?.includes("Invalid API key")) {
        console.error("Supabase API key error - check your SUPABASE_ANON_KEY or SUPABASE_SERVICE_ROLE_KEY");
        throw profileError;
      }
      throw profileError;
    }
    
    // If no profile, user needs to complete setup
    if (!profile) {
      return res.status(404).json({ 
        error: "Profile not found",
        code: "PROFILE_SETUP_REQUIRED",
        message: "Please complete your profile setup"
      });
    }

    const { data: customer, error: customerError } = await supabaseAdmin
      .from("customers")
      .select("*")
      .eq("user_id", user.id)
      .maybeSingle();

    if (customerError) throw customerError;
    
    // If no customer record but profile exists, create it
    if (!customer) {
      const { data: newCustomer, error: createError } = await supabaseAdmin
        .from("customers")
        .insert({ user_id: user.id })
        .select()
        .single();
      
      if (createError) {
        // If RLS error, check if customer was created by another process
        if (createError.message?.includes("row-level security")) {
          const { data: existingCustomer } = await supabaseAdmin
            .from("customers")
            .select("*")
            .eq("user_id", user.id)
            .maybeSingle();
          
          if (existingCustomer) {
            return res.json({
              ...profile,
              ...existingCustomer,
              email: user.email || null
            });
          }
        }
        throw createError;
      }

      return res.json({
        ...profile,
        ...newCustomer,
        email: user.email || null
      });
    }

    res.json({
      ...profile,
      ...customer,
      email: user.email || null
    });
  } catch (error: any) {
    // Handle PGRST116 error (no rows found) gracefully
    if (error?.code === 'PGRST116') {
      return res.status(404).json({ 
        error: "Profile not found",
        code: "PROFILE_SETUP_REQUIRED"
      });
    }
    console.error("Error fetching profile:", error);
    res.status(500).json({ error: error.message });
  }
});

// Update customer profile
router.put("/profile", async (req, res) => {
  const user = (req as any).user;
  const {
    fullName,
    phone,
    companyName,
    tradingAs,
    vatNumber,
    billingAddressStreet,
    billingAddressCity,
    billingAddressProvince,
    billingAddressPostalCode,
    billingAddressCountry
  } = req.body;
  
  try {
    // Update profile table
    const { error: profileError } = await supabaseAdmin
      .from("profiles")
      .update({
        full_name: fullName,
        phone,
        updated_at: new Date().toISOString()
      })
      .eq("id", user.id);

    if (profileError) throw profileError;

    // Update customer table
    const { data: updatedCustomer, error: customerError } = await supabaseAdmin
      .from("customers")
      .update({
        company_name: companyName,
        trading_as: tradingAs,
        vat_number: vatNumber,
        billing_address_street: billingAddressStreet,
        billing_address_city: billingAddressCity,
        billing_address_province: billingAddressProvince,
        billing_address_postal_code: billingAddressPostalCode,
        billing_address_country: billingAddressCountry,
        updated_at: new Date().toISOString()
      })
      .eq("user_id", user.id)
      .select()
      .single();

    if (customerError) throw customerError;

    res.json({ success: true, customer: updatedCustomer });
  } catch (error: any) {
    console.error("Error updating profile:", error);
    res.status(500).json({ error: error.message });
  }
});

// Get driver's current location for an order
router.get("/orders/:orderId/driver-location", async (req, res) => {
  const user = (req as any).user;
  const { orderId } = req.params;

  try {
    // Get customer ID
    const { data: customer, error: customerError } = await supabaseAdmin
      .from("customers")
      .select("id")
      .eq("user_id", user.id)
      .single();

    if (customerError) throw customerError;
    if (!customer) {
      return res.status(404).json({ error: "Customer profile not found" });
    }

    // Get order and verify it belongs to customer
    const { data: order, error: orderError } = await supabaseAdmin
      .from("orders")
      .select("id, assigned_driver_id, state")
      .eq("id", orderId)
      .eq("customer_id", customer.id)
      .single();

    if (orderError) throw orderError;
    if (!order) {
      return res.status(404).json({ error: "Order not found" });
    }

    // Check if driver is assigned
    if (!order.assigned_driver_id) {
      return res.status(404).json({ error: "No driver assigned to this order" });
    }

    // Get driver's current location
    const { data: driver, error: driverError } = await supabaseAdmin
      .from("drivers")
      .select("current_lat, current_lng, user_id")
      .eq("id", order.assigned_driver_id)
      .maybeSingle(); // Use maybeSingle() instead of single() to handle zero rows gracefully

    if (driverError) {
      console.error("Driver query error:", driverError);
      return res.status(500).json({ error: "Failed to fetch driver information" });
    }
    
    if (!driver) {
      return res.status(404).json({ error: "Driver not found" });
    }

    // Check if driver has set their location
    if (!driver.current_lat || !driver.current_lng) {
      return res.status(404).json({ error: "No driver location available" });
    }

    // Get driver profile for additional details
    const { data: driverProfile } = await supabaseAdmin
      .from("profiles")
      .select("full_name")
      .eq("id", driver.user_id)
      .maybeSingle();

    res.json({
      latitude: driver.current_lat,
      longitude: driver.current_lng,
      driverName: driverProfile?.full_name || "Driver",
      orderState: order.state,
    });
  } catch (error: any) {
    console.error("Error fetching driver location:", error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
