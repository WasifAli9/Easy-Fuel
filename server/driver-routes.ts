import { Router } from "express";
import { supabaseAdmin } from "./supabase";
import { sendDriverAcceptanceEmail } from "./email-service";
import { insertDriverPricingSchema, insertPricingHistorySchema } from "@shared/schema";
import { websocketService } from "./websocket";

const router = Router();

// Get driver profile
router.get("/profile", async (req, res) => {
  const user = (req as any).user;
  
  try {
    const { data: driver, error } = await supabaseAdmin
      .from("drivers")
      .select("*")
      .eq("user_id", user.id)
      .single();

    if (error) throw error;
    if (!driver) {
      return res.status(404).json({ error: "Driver profile not found" });
    }

    res.json(driver);
  } catch (error: any) {
    console.error("Error fetching driver profile:", error);
    res.status(500).json({ error: error.message });
  }
});

// Helper function to convert snake_case to camelCase for vehicle objects
function vehicleToCamelCase(vehicle: any) {
  if (!vehicle) return null;
  return {
    id: vehicle.id,
    driverId: vehicle.driver_id,
    registrationNumber: vehicle.registration_number,
    make: vehicle.make,
    model: vehicle.model,
    year: vehicle.year,
    capacityLitres: vehicle.capacity_litres,
    fuelTypes: vehicle.fuel_types,
    licenseDiskExpiry: vehicle.license_disk_expiry,
    roadworthyExpiry: vehicle.roadworthy_expiry,
    insuranceExpiry: vehicle.insurance_expiry,
    trackerInstalled: vehicle.tracker_installed,
    trackerProvider: vehicle.tracker_provider,
    vehicleRegistrationCertDocId: vehicle.vehicle_registration_cert_doc_id,
    createdAt: vehicle.created_at,
    updatedAt: vehicle.updated_at,
  };
}

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

    // Begin atomic updates with state guards to prevent race conditions
    
    // 1. Accept this offer (only if still in "offered" state)
    const { data: acceptedOffer, error: acceptError } = await supabaseAdmin
      .from("dispatch_offers")
      .update({ state: "accepted", updated_at: new Date().toISOString() })
      .eq("id", offerId)
      .eq("state", "offered")
      .select()
      .single();

    if (acceptError || !acceptedOffer) {
      return res.status(409).json({ 
        error: "Offer is no longer available (may have been accepted by another driver or expired)" 
      });
    }

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

    // 3. Update order with assigned driver (only if still in "created" state)
    const { data: updatedOrder, error: orderError } = await supabaseAdmin
      .from("orders")
      .update({
        state: "assigned",
        assigned_driver_id: driver.id,
        confirmed_delivery_time: confirmedDeliveryTime,
        updated_at: new Date().toISOString(),
      })
      .eq("id", offer.order_id)
      .eq("state", "created")
      .select("*, customers!inner(user_id)")
      .single();

    if (orderError || !updatedOrder) {
      // Rollback: un-accept this offer since order update failed
      await supabaseAdmin
        .from("dispatch_offers")
        .update({ state: "offered", updated_at: new Date().toISOString() })
        .eq("id", offerId);
      
      return res.status(409).json({ 
        error: "Order is no longer available (may have been assigned to another driver)" 
      });
    }

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

    // 5. Send WebSocket notification to customer
    if (updatedOrder?.customers?.user_id) {
      const sent = websocketService.sendOrderUpdate(updatedOrder.customers.user_id, {
        orderId: offer.order_id,
        state: "assigned",
        driverId: driver.id,
        confirmedDeliveryTime,
      });

      // Fallback to database notification if WebSocket fails
      if (!sent) {
        await supabaseAdmin.from("notifications").insert({
          user_id: updatedOrder.customers.user_id,
          type: "order_update",
          title: "Driver Assigned",
          body: "A driver has been assigned to your order",
          data: { orderId: offer.order_id, state: "assigned" },
        });
      }
    }

    // 6. Send email notification to customer (async, don't wait)
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

// ========== VEHICLE MANAGEMENT ROUTES ==========

// Get all vehicles for authenticated driver
router.get("/vehicles", async (req, res) => {
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

    // Get all vehicles for this driver
    const { data: vehicles, error: vehiclesError } = await supabaseAdmin
      .from("vehicles")
      .select("*")
      .eq("driver_id", driver.id)
      .order("created_at", { ascending: false });

    if (vehiclesError) throw vehiclesError;

    // Transform to camelCase for frontend
    const camelCaseVehicles = (vehicles || []).map(vehicleToCamelCase);
    res.json(camelCaseVehicles);
  } catch (error: any) {
    console.error("Error fetching driver vehicles:", error);
    
    // Check for PostgREST schema cache error
    if (error?.code === 'PGRST205' || error?.message?.includes('schema cache')) {
      return res.status(500).json({ 
        error: "Database schema cache needs refresh. Please run 'NOTIFY pgrst, \"reload schema\";' in your Supabase SQL Editor and try again in 10 seconds.",
        code: 'SCHEMA_CACHE_ERROR'
      });
    }
    
    res.status(500).json({ error: error.message });
  }
});

// Add new vehicle for authenticated driver
router.post("/vehicles", async (req, res) => {
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

    // Sanitize and validate input - only allow specific fields
    const vehicleData = {
      driver_id: driver.id, // Always set to authenticated driver
      registration_number: req.body.registration_number,
      make: req.body.make,
      model: req.body.model,
      year: req.body.year,
      capacity_litres: req.body.capacity_litres,
      fuel_types: req.body.fuel_types,
      license_disk_expiry: req.body.license_disk_expiry,
      roadworthy_expiry: req.body.roadworthy_expiry,
      insurance_expiry: req.body.insurance_expiry,
      tracker_installed: req.body.tracker_installed,
      tracker_provider: req.body.tracker_provider,
    };

    // Insert new vehicle
    const { data: vehicle, error: vehicleError } = await supabaseAdmin
      .from("vehicles")
      .insert(vehicleData)
      .select()
      .single();

    if (vehicleError) throw vehicleError;

    // Transform to camelCase for frontend
    res.json(vehicleToCamelCase(vehicle));
  } catch (error: any) {
    console.error("Error adding vehicle:", error);
    
    // Check for PostgREST schema cache error
    if (error?.code === 'PGRST205' || error?.message?.includes('schema cache')) {
      return res.status(500).json({ 
        error: "Database schema cache needs refresh. Please run 'NOTIFY pgrst, \"reload schema\";' in your Supabase SQL Editor and try again in 10 seconds.",
        code: 'SCHEMA_CACHE_ERROR'
      });
    }
    
    res.status(500).json({ error: error.message });
  }
});

// Update vehicle for authenticated driver
router.patch("/vehicles/:vehicleId", async (req, res) => {
  const user = (req as any).user;
  const { vehicleId } = req.params;

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

    // Verify vehicle belongs to this driver
    const { data: existingVehicle, error: checkError } = await supabaseAdmin
      .from("vehicles")
      .select("id")
      .eq("id", vehicleId)
      .eq("driver_id", driver.id)
      .single();

    if (checkError || !existingVehicle) {
      return res.status(404).json({ error: "Vehicle not found or access denied" });
    }

    // Sanitize update data - only allow specific fields, never allow driver_id override
    const updateData: any = {};
    if (req.body.registration_number !== undefined) updateData.registration_number = req.body.registration_number;
    if (req.body.make !== undefined) updateData.make = req.body.make;
    if (req.body.model !== undefined) updateData.model = req.body.model;
    if (req.body.year !== undefined) updateData.year = req.body.year;
    if (req.body.capacity_litres !== undefined) updateData.capacity_litres = req.body.capacity_litres;
    if (req.body.fuel_types !== undefined) updateData.fuel_types = req.body.fuel_types;
    if (req.body.license_disk_expiry !== undefined) updateData.license_disk_expiry = req.body.license_disk_expiry;
    if (req.body.roadworthy_expiry !== undefined) updateData.roadworthy_expiry = req.body.roadworthy_expiry;
    if (req.body.insurance_expiry !== undefined) updateData.insurance_expiry = req.body.insurance_expiry;
    if (req.body.tracker_installed !== undefined) updateData.tracker_installed = req.body.tracker_installed;
    if (req.body.tracker_provider !== undefined) updateData.tracker_provider = req.body.tracker_provider;

    // Update vehicle
    const { data: vehicle, error: updateError } = await supabaseAdmin
      .from("vehicles")
      .update(updateData)
      .eq("id", vehicleId)
      .select()
      .single();

    if (updateError) throw updateError;

    // Transform to camelCase for frontend
    res.json(vehicleToCamelCase(vehicle));
  } catch (error: any) {
    console.error("Error updating vehicle:", error);
    
    // Check for PostgREST schema cache error
    if (error?.code === 'PGRST205' || error?.message?.includes('schema cache')) {
      return res.status(500).json({ 
        error: "Database schema cache needs refresh. Please run 'NOTIFY pgrst, \"reload schema\";' in your Supabase SQL Editor and try again in 10 seconds.",
        code: 'SCHEMA_CACHE_ERROR'
      });
    }
    
    res.status(500).json({ error: error.message });
  }
});

// Delete vehicle for authenticated driver
router.delete("/vehicles/:vehicleId", async (req, res) => {
  const user = (req as any).user;
  const { vehicleId } = req.params;

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

    // Verify vehicle belongs to this driver and delete
    const { error: deleteError } = await supabaseAdmin
      .from("vehicles")
      .delete()
      .eq("id", vehicleId)
      .eq("driver_id", driver.id);

    if (deleteError) throw deleteError;

    res.json({ success: true, message: "Vehicle deleted successfully" });
  } catch (error: any) {
    console.error("Error deleting vehicle:", error);
    
    // Check for PostgREST schema cache error
    if (error?.code === 'PGRST205' || error?.message?.includes('schema cache')) {
      return res.status(500).json({ 
        error: "Database schema cache needs refresh. Please run 'NOTIFY pgrst, \"reload schema\";' in your Supabase SQL Editor and try again in 10 seconds.",
        code: 'SCHEMA_CACHE_ERROR'
      });
    }
    
    res.status(500).json({ error: error.message });
  }
});

// Get driver preferences (radius and location)
router.get("/preferences", async (req, res) => {
  const user = (req as any).user;

  try {
    // Get driver profile with preferences
    const { data: driver, error: driverError } = await supabaseAdmin
      .from("drivers")
      .select("id, job_radius_preference_miles, current_lat, current_lng")
      .eq("user_id", user.id)
      .single();

    if (driverError) throw driverError;
    if (!driver) {
      return res.status(404).json({ error: "Driver profile not found" });
    }

    res.json({
      jobRadiusPreferenceMiles: driver.job_radius_preference_miles || 20,
      currentLat: driver.current_lat,
      currentLng: driver.current_lng,
    });
  } catch (error: any) {
    console.error("Error fetching driver preferences:", error);
    res.status(500).json({ error: error.message });
  }
});

// Update driver preferences (radius and/or location)
router.patch("/preferences", async (req, res) => {
  const user = (req as any).user;
  const { jobRadiusPreferenceMiles, currentLat, currentLng } = req.body;

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

    // Build update object with only provided fields
    const updateData: any = {};
    
    if (jobRadiusPreferenceMiles !== undefined) {
      const radius = parseFloat(jobRadiusPreferenceMiles);
      if (isNaN(radius) || radius < 1 || radius > 500) {
        return res.status(400).json({ 
          error: "Radius must be between 1 and 500 miles" 
        });
      }
      updateData.job_radius_preference_miles = radius;
    }

    if (currentLat !== undefined && currentLng !== undefined) {
      const lat = parseFloat(currentLat);
      const lng = parseFloat(currentLng);
      
      if (isNaN(lat) || isNaN(lng)) {
        return res.status(400).json({ error: "Invalid coordinates" });
      }
      
      if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
        return res.status(400).json({ 
          error: "Coordinates out of range" 
        });
      }
      
      updateData.current_lat = lat;
      updateData.current_lng = lng;
    }

    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({ 
        error: "No valid fields to update" 
      });
    }

    updateData.updated_at = new Date().toISOString();

    // Update driver preferences
    const { data: updatedDriver, error: updateError } = await supabaseAdmin
      .from("drivers")
      .update(updateData)
      .eq("id", driver.id)
      .select("id, job_radius_preference_miles, current_lat, current_lng")
      .single();

    if (updateError) throw updateError;

    res.json({
      jobRadiusPreferenceMiles: updatedDriver.job_radius_preference_miles,
      currentLat: updatedDriver.current_lat,
      currentLng: updatedDriver.current_lng,
    });
  } catch (error: any) {
    console.error("Error updating driver preferences:", error);
    
    // Check for PostgREST schema cache error
    if (error?.code === 'PGRST205' || error?.message?.includes('schema cache')) {
      return res.status(500).json({ 
        error: "Database schema cache needs refresh. Please run 'NOTIFY pgrst, \"reload schema\";' in your Supabase SQL Editor and try again in 10 seconds.",
        code: 'SCHEMA_CACHE_ERROR'
      });
    }
    
    res.status(500).json({ error: error.message });
  }
});

// ============================================================================
// DRIVER PRICING ROUTES
// ============================================================================

// Get driver pricing for all fuel types
router.get("/pricing", async (req, res) => {
  const user = (req as any).user;

  try {
    // Get driver ID
    const { data: driver, error: driverError } = await supabaseAdmin
      .from("drivers")
      .select("id")
      .eq("user_id", user.id)
      .single();

    if (driverError) throw driverError;
    if (!driver) {
      return res.status(404).json({ error: "Driver profile not found" });
    }

    // Get all active fuel types
    const { data: fuelTypes, error: fuelTypesError } = await supabaseAdmin
      .from("fuel_types")
      .select("id, code, label, active")
      .eq("active", true)
      .order("label");

    if (fuelTypesError) throw fuelTypesError;

    // Get all pricing for this driver
    const { data: driverPricingList, error: pricingError } = await supabaseAdmin
      .from("driver_pricing")
      .select("id, fuel_type_id, delivery_fee_cents, active")
      .eq("driver_id", driver.id);

    if (pricingError) throw pricingError;

    // Create a map for quick lookup
    const pricingMap = new Map(
      (driverPricingList || []).map((p: any) => [p.fuel_type_id, p])
    );

    // Combine fuel types with their pricing (or null if not set)
    const result = fuelTypes.map((ft: any) => ({
      id: ft.id,
      code: ft.code,
      label: ft.label,
      active: ft.active,
      pricing: pricingMap.get(ft.id) || null,
    }));

    res.json(result);
  } catch (error: any) {
    console.error("Error fetching driver pricing:", error);
    
    if (error?.code === 'PGRST205' || error?.message?.includes('schema cache')) {
      return res.status(500).json({ 
        error: "Database schema cache needs refresh. Please run 'NOTIFY pgrst, \"reload schema\";' in your Supabase SQL Editor and try again in 10 seconds.",
        code: 'SCHEMA_CACHE_ERROR'
      });
    }
    
    res.status(500).json({ error: error.message });
  }
});

// Update or create pricing for a specific fuel type
router.put("/pricing/:fuelTypeId", async (req, res) => {
  const user = (req as any).user;
  const { fuelTypeId } = req.params;
  const { deliveryFeeCents, notes } = req.body;

  try {
    // Get driver ID
    const { data: driver, error: driverError } = await supabaseAdmin
      .from("drivers")
      .select("id")
      .eq("user_id", user.id)
      .single();

    if (driverError) throw driverError;
    if (!driver) {
      return res.status(404).json({ error: "Driver profile not found" });
    }

    // Validate delivery fee
    if (deliveryFeeCents === undefined || deliveryFeeCents < 0) {
      return res.status(400).json({ error: "Invalid delivery fee" });
    }

    // Check if pricing already exists
    const { data: existingPricing, error: fetchError } = await supabaseAdmin
      .from("driver_pricing")
      .select("*")
      .eq("driver_id", driver.id)
      .eq("fuel_type_id", fuelTypeId)
      .maybeSingle();

    if (fetchError) throw fetchError;

    let updatedPricing;

    if (existingPricing) {
      // Update existing pricing
      const { data, error: updateError } = await supabaseAdmin
        .from("driver_pricing")
        .update({
          delivery_fee_cents: deliveryFeeCents,
          updated_at: new Date().toISOString(),
        })
        .eq("id", existingPricing.id)
        .select()
        .single();

      if (updateError) throw updateError;
      updatedPricing = data;

      // Add to pricing history
      await supabaseAdmin.from("pricing_history").insert({
        entity_type: "driver",
        entity_id: driver.id,
        fuel_type_id: fuelTypeId,
        old_price_cents: existingPricing.delivery_fee_cents,
        new_price_cents: deliveryFeeCents,
        changed_by: user.id,
        notes: notes || null,
      });
    } else {
      // Create new pricing
      const { data, error: insertError } = await supabaseAdmin
        .from("driver_pricing")
        .insert({
          driver_id: driver.id,
          fuel_type_id: fuelTypeId,
          delivery_fee_cents: deliveryFeeCents,
          active: true,
        })
        .select()
        .single();

      if (insertError) throw insertError;
      updatedPricing = data;

      // Add to pricing history (no old price for new entries)
      await supabaseAdmin.from("pricing_history").insert({
        entity_type: "driver",
        entity_id: driver.id,
        fuel_type_id: fuelTypeId,
        old_price_cents: null,
        new_price_cents: deliveryFeeCents,
        changed_by: user.id,
        notes: notes || null,
      });
    }

    res.json(updatedPricing);
  } catch (error: any) {
    console.error("Error updating driver pricing:", error);
    
    if (error?.code === 'PGRST205' || error?.message?.includes('schema cache')) {
      return res.status(500).json({ 
        error: "Database schema cache needs refresh. Please run 'NOTIFY pgrst, \"reload schema\";' in your Supabase SQL Editor and try again in 10 seconds.",
        code: 'SCHEMA_CACHE_ERROR'
      });
    }
    
    res.status(500).json({ error: error.message });
  }
});

// Get pricing history for driver
router.get("/pricing/history", async (req, res) => {
  const user = (req as any).user;

  try {
    // Get driver ID
    const { data: driver, error: driverError } = await supabaseAdmin
      .from("drivers")
      .select("id")
      .eq("user_id", user.id)
      .single();

    if (driverError) throw driverError;
    if (!driver) {
      return res.status(404).json({ error: "Driver profile not found" });
    }

    // Get pricing history
    const { data: history, error: historyError } = await supabaseAdmin
      .from("pricing_history")
      .select(`
        id,
        old_price_cents,
        new_price_cents,
        notes,
        created_at,
        fuel_types:fuel_type_id (
          label,
          code
        )
      `)
      .eq("entity_type", "driver")
      .eq("entity_id", driver.id)
      .order("created_at", { ascending: false });

    if (historyError) throw historyError;

    res.json(history || []);
  } catch (error: any) {
    console.error("Error fetching pricing history:", error);
    
    if (error?.code === 'PGRST205' || error?.message?.includes('schema cache')) {
      return res.status(500).json({ 
        error: "Database schema cache needs refresh. Please run 'NOTIFY pgrst, \"reload schema\";' in your Supabase SQL Editor and try again in 10 seconds.",
        code: 'SCHEMA_CACHE_ERROR'
      });
    }
    
    res.status(500).json({ error: error.message });
  }
});

// Update driver's current GPS location
router.put("/location", async (req, res) => {
  const user = (req as any).user;
  
  try {
    const { latitude, longitude } = req.body;

    if (typeof latitude !== "number" || typeof longitude !== "number") {
      return res.status(400).json({ error: "Valid latitude and longitude are required" });
    }

    // Validate coordinates
    if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
      return res.status(400).json({ error: "Invalid coordinates" });
    }

    // Get driver ID
    const { data: driver, error: driverError } = await supabaseAdmin
      .from("drivers")
      .select("id")
      .eq("user_id", user.id)
      .single();

    if (driverError) throw driverError;
    if (!driver) {
      return res.status(404).json({ error: "Driver profile not found" });
    }

    // Update driver's current location
    const { error: updateError } = await supabaseAdmin
      .from("drivers")
      .update({
        current_lat: latitude,
        current_lng: longitude,
        updated_at: new Date().toISOString(),
      })
      .eq("id", driver.id);

    if (updateError) throw updateError;

    res.json({ success: true, latitude, longitude });
  } catch (error: any) {
    console.error("Error updating driver location:", error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
