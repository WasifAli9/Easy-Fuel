import { Router } from "express";
import { supabaseAdmin } from "./supabase";
import { sendDriverAcceptanceEmail, sendDeliveryCompletionEmail } from "./email-service";
import { insertDriverPricingSchema, insertPricingHistorySchema } from "@shared/schema";
import { websocketService } from "./websocket";
import { pushNotificationService } from "./push-service";
import { cleanupChatForOrder, ensureChatThreadForAssignment } from "./chat-service";
import { offerNotifications, orderNotifications } from "./notification-helpers";
import { z } from "zod";
import dotenv from "dotenv";
dotenv.config();

const router = Router();

// Get driver profile
router.get("/profile", async (req, res) => {
  const user = (req as any).user;
  
  try {
    // Get profile data (includes currency)
    const { data: profile, error: profileError } = await supabaseAdmin
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .maybeSingle();

    if (profileError) {
      // If it's an API key error, it means the key is invalid
      if (profileError.message?.includes("Invalid API key")) {
        throw profileError;
      }
      throw profileError;
    }
    
    // If no profile, user needs to complete setup
    if (!profile) {
      return res.status(404).json({ 
        error: "Driver profile not found",
        code: "PROFILE_SETUP_REQUIRED",
        message: "Please complete your profile setup"
      });
    }
    
    // Debug: Log profile data to see if profile_photo_url is included
    console.log("Driver profile fetched:", {
      id: profile.id,
      full_name: profile.full_name,
      profile_photo_url: profile.profile_photo_url,
      has_photo_url: !!profile.profile_photo_url
    });

    // Get driver-specific data
    const { data: driver, error: driverError } = await supabaseAdmin
      .from("drivers")
      .select("*")
      .eq("user_id", user.id)
      .maybeSingle();

    if (driverError) {
      // If it's an API key error, it means the key is invalid
      if (driverError.message?.includes("Invalid API key")) {
        throw driverError;
      }
      throw driverError;
    }
    
    // If no driver record but profile exists, create it
    if (!driver) {
      const { data: newDriver, error: createError } = await supabaseAdmin
        .from("drivers")
        .insert({ 
          user_id: user.id,
          kyc_status: "pending"
        })
        .select()
        .single();
      
      if (createError) {
        // If RLS error, try to get the driver record that might have been created
        if (createError.message?.includes("row-level security")) {
          // Check if driver was created by another process
          const { data: existingDriver } = await supabaseAdmin
            .from("drivers")
            .select("*")
            .eq("user_id", user.id)
            .maybeSingle();
          
          if (existingDriver) {
            // Driver exists, use it
            return res.json({
              ...profile,
              ...existingDriver,
              email: user.email || null
            });
          }
        }
        throw createError;
      }

      return res.json({
        ...profile,
        ...newDriver,
        email: user.email || null
      });
    }

    // Combine profile, driver, and email data
    res.json({
      ...profile,
      ...driver,
      email: user.email || null
    });
  } catch (error: any) {
    // Handle PGRST116 error (no rows found) gracefully
    if (error?.code === 'PGRST116') {
      return res.status(404).json({ 
        error: "Driver profile not found",
        code: "PROFILE_SETUP_REQUIRED"
      });
    }
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

function formatDeliveryAddress(order: any): string {
  if (order?.delivery_addresses) {
    const { address_street, address_city, address_province } = order.delivery_addresses;
    return [address_street, address_city, address_province].filter(Boolean).join(", ");
  }

  if (order?.drop_lat && order?.drop_lng) {
    return `${order.drop_lat}, ${order.drop_lng}`;
  }

  return "Address not specified";
}

function formatDateTimeForZA(date: string | null | undefined): string {
  if (!date) return "Not specified";
  return new Date(date).toLocaleString("en-ZA", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Africa/Johannesburg",
  });
}

const deliveryCompletionSchema = z.object({
  signatureData: z
    .string({
      required_error: "Signature data is required",
      invalid_type_error: "Signature data must be a string",
    })
    .min(20, "Signature data is too short"),
  signatureName: z
    .string()
    .trim()
    .max(120, "Signature name must be 120 characters or less")
    .optional()
    .or(z.literal("")),
});

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

    // Get customer email - try to get from order data or use fallback
    let customerEmail: string | null = null;
    try {
      // Try to get email from customer profile if available
      if (order.customers?.user_id) {
        const { data: customerProfile } = await supabaseAdmin
          .from("profiles")
          .select("email")
          .eq("id", order.customers.user_id)
          .maybeSingle();
        customerEmail = customerProfile?.email || null;
      }
    } catch (e) {
      // If we can't get email, continue without it
    }

    if (!customerEmail) {
      // Use a fallback email or skip email sending
      customerEmail = order.customers?.company_name 
        ? `${order.customers.company_name.toLowerCase().replace(/\s+/g, '.')}@customer.easyfuel.ai`
        : "customer@easyfuel.ai";
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

    const deliveryAddress = formatDeliveryAddress(order);
    const formattedTime = formatDateTimeForZA(confirmedDeliveryTime);

    // Send email
    await sendDriverAcceptanceEmail({
      customerEmail: customerEmail,
      customerName: order.customers.company_name || "Customer",
      orderNumber: order.id.substring(0, 8).toUpperCase(),
      driverName: driverProfile.full_name || "Driver",
      driverPhone: driverProfile.phone || "Not available",
      confirmedDeliveryTime: formattedTime,
      fuelType: order.fuel_types?.label || "Fuel",
      litres: order.litres,
      deliveryAddress,
    });

  } catch (error) {
    throw error;
  }
}

async function fetchOrderForDriver(orderId: string, driverId: string) {
  const { data: order, error } = await supabaseAdmin
    .from("orders")
    .select(`
      *,
      customers (
        id,
        company_name,
        user_id
      ),
      fuel_types (
        id,
        label
      ),
      delivery_addresses (
        id,
        label,
        address_street,
        address_city,
        address_province
      )
    `)
    .eq("id", orderId)
    .eq("assigned_driver_id", driverId)
    .single();

  if (error || !order) {
    return null;
  }

  return order;
}

// Helper function to fetch full order data for WebSocket broadcast
async function fetchFullOrderData(orderId: string) {
  const { data: order, error } = await supabaseAdmin
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
      ),
      customers (
        id,
        company_name,
        user_id
      )
    `)
    .eq("id", orderId)
    .single();

  if (error || !order) {
    return null;
  }

  return order;
}

async function getUserEmail(userId: string | null | undefined) {
  if (!userId) return null;
  try {
    const { data, error } = await supabaseAdmin.auth.admin.getUserById(userId);
    if (error || !data?.user) return null;
    return data.user.email || null;
  } catch (error) {
    return null;
  }
}

// Get all pending dispatch offers for the authenticated driver
router.get("/offers", async (req, res) => {
  const user = (req as any).user;

  try {
    // Get driver ID and status from user ID
    // Note: availability_status column may not exist in all databases, so we'll check for it
    let { data: driver, error: driverError } = await supabaseAdmin
      .from("drivers")
      .select("id, kyc_status, current_lat, current_lng, job_radius_preference_miles")
      .eq("user_id", user.id)
      .maybeSingle();

    if (driverError) throw driverError;
    
    // If no driver record, create it automatically
    if (!driver) {
      const { data: newDriver, error: createError } = await supabaseAdmin
        .from("drivers")
        .insert({ 
          user_id: user.id,
          kyc_status: "pending"
        })
        .select("id, kyc_status, current_lat, current_lng, job_radius_preference_miles")
        .single();
      
      if (createError) throw createError;
      driver = newDriver;
    }

    // Check driver eligibility for offers
    const eligibilityIssues: string[] = [];
    
    // Check location
    if (!driver.current_lat || !driver.current_lng) {
      eligibilityIssues.push("Location not set (update your location in Settings)");
    }

    const now = new Date().toISOString();

    // NEW FLOW: Drivers don't need to write offers anymore
    // Offers are automatically created when customer places order with state "pending_customer"
    // Drivers only see orders that are already assigned to them (in "My Jobs" tab)
    // This endpoint now returns empty array - drivers don't need to see available orders
    
    // Return empty array - no manual offers needed
    // Drivers will only see assigned orders in the "My Jobs" tab
    // The "Available" tab will show an informational message
    res.json({
      offers: [],
      message: "Orders are automatically matched. You'll see assigned orders in 'My Jobs' tab.",
      eligibilityIssues,
      driverStatus: {
        hasLocation: !!(driver.current_lat && driver.current_lng),
      }
    });
  } catch (error: any) {
    // Handle PGRST116 error (no rows found) gracefully
    if (error?.code === 'PGRST116') {
      return res.json([]);
    }
    res.status(500).json({ error: error.message });
  }
});

// Driver stats (earnings, active/completed jobs)
router.get("/stats", async (req, res) => {
  const user = (req as any).user;

  try {
    // Ensure driver profile exists
    let { data: driver, error: driverError } = await supabaseAdmin
      .from("drivers")
      .select("id")
      .eq("user_id", user.id)
      .maybeSingle();

    if (driverError) throw driverError;

    if (!driver) {
      const { data: newDriver, error: createError } = await supabaseAdmin
        .from("drivers")
        .insert({
          user_id: user.id,
          kyc_status: "pending",
        })
        .select("id")
        .single();

      if (createError) throw createError;
      driver = newDriver;
    }

    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    // Calculate start of the current week (Monday as first day)
    const startOfWeek = new Date(startOfToday);
    const day = startOfWeek.getDay(); // Sunday - Saturday : 0 - 6
    const diff = startOfWeek.getDate() - day + (day === 0 ? -6 : 1); // adjust when day is Sunday
    startOfWeek.setDate(diff);

    const todayISO = startOfToday.toISOString();
    const weekISO = startOfWeek.toISOString();

    // Active jobs (assigned / en route / picked up)
    const { count: activeJobsCount, error: activeError } = await supabaseAdmin
      .from("orders")
      .select("*", { count: "exact", head: true })
      .eq("assigned_driver_id", driver.id)
      .in("state", ["assigned", "en_route", "picked_up"]);

    if (activeError) throw activeError;

    // This week's earnings (delivered this week)
    const { data: thisWeekOrders, error: weekError } = await supabaseAdmin
      .from("orders")
      .select("delivery_fee_cents, total_cents")
      .eq("assigned_driver_id", driver.id)
      .eq("state", "delivered")
      .gte("delivered_at", weekISO);

    if (weekError) throw weekError;

    const todayEarningsCents = (thisWeekOrders || []).reduce((sum, order: any) => {
      const deliveryFee = Number(order.delivery_fee_cents) || 0;
      const total = Number(order.total_cents) || 0;
      return sum + (deliveryFee > 0 ? deliveryFee : total);
    }, 0);

    // Completed deliveries this week
    const { data: completedThisWeekOrders, error: completedError } = await supabaseAdmin
      .from("orders")
      .select("id")
      .eq("assigned_driver_id", driver.id)
      .eq("state", "delivered")
      .gte("delivered_at", weekISO);

    if (completedError) throw completedError;

    const completedThisWeek = completedThisWeekOrders?.length || 0;

    // Lifetime totals
    const { data: deliveredOrders, error: deliveredError } = await supabaseAdmin
      .from("orders")
      .select("delivery_fee_cents, total_cents")
      .eq("assigned_driver_id", driver.id)
      .eq("state", "delivered");

    if (deliveredError) throw deliveredError;

    const totalEarningsCents = (deliveredOrders || []).reduce((sum, order: any) => {
      const deliveryFee = Number(order.delivery_fee_cents) || 0;
      const total = Number(order.total_cents) || 0;
      return sum + (deliveryFee > 0 ? deliveryFee : total);
    }, 0);

    const totalDeliveries = deliveredOrders?.length || 0;

    res.json({
      activeJobs: activeJobsCount || 0,
      todayEarningsCents,
      completedThisWeek,
      totalEarningsCents,
      totalDeliveries,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message || "Failed to fetch stats" });
  }
});

// Get driver's assigned orders (accepted deliveries)
router.get("/assigned-orders", async (req, res) => {
  const user = (req as any).user;

  try {
    // Get driver ID from user ID
    let { data: driver, error: driverError } = await supabaseAdmin
      .from("drivers")
      .select("id")
      .eq("user_id", user.id)
      .maybeSingle();

    if (driverError) throw driverError;
    
    // If no driver record, create it automatically
    if (!driver) {
      const { data: newDriver, error: createError } = await supabaseAdmin
        .from("drivers")
        .insert({ 
          user_id: user.id,
          kyc_status: "pending"
        })
        .select("id")
        .single();
      
      if (createError) throw createError;
      driver = newDriver;
    }

    // Fetch orders assigned to this driver
    const { data: orders, error: ordersError } = await supabaseAdmin
      .from("orders")
      .select(`
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
      `)
      .eq("assigned_driver_id", driver.id)
      .in("state", ["assigned", "en_route", "picked_up"])
      .order("created_at", { ascending: false });

    if (ordersError) throw ordersError;

    // Enrich orders with customer profile data
    if (orders && orders.length > 0) {
      const customerUserIds = Array.from(new Set(orders.map((o: any) => o.customers?.user_id).filter(Boolean)));
      
      if (customerUserIds.length > 0) {
        const { data: profiles } = await supabaseAdmin
          .from("profiles")
          .select("id, full_name, phone")
          .in("id", customerUserIds);

        const profileMap = new Map(profiles?.map((p: any) => [p.id, p]) || []);

        // Add customer profile data to orders
        orders.forEach((order: any) => {
          if (order.customers?.user_id) {
            order.customers.profiles = profileMap.get(order.customers.user_id) || null;
          }
        });
      }
    }

    res.json(orders || []);
  } catch (error: any) {
    // Handle PGRST116 error (no rows found) gracefully
    if (error?.code === 'PGRST116') {
      return res.json([]);
    }
    res.status(500).json({ error: error.message });
  }
});

// Get completed orders (last week)
router.get("/completed-orders", async (req, res) => {
  const user = (req as any).user;

  try {
    // Get driver ID from user ID
    let { data: driver, error: driverError } = await supabaseAdmin
      .from("drivers")
      .select("id")
      .eq("user_id", user.id)
      .maybeSingle();

    if (driverError) throw driverError;
    
    // If no driver record, return empty array
    if (!driver) {
      return res.json([]);
    }

    // Calculate date 7 days ago
    const oneWeekAgo = new Date();
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
    const oneWeekAgoISO = oneWeekAgo.toISOString();

    // Fetch completed orders from the last week
    const { data: orders, error: ordersError } = await supabaseAdmin
      .from("orders")
      .select(`
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
          address_province,
          address_postal_code
        ),
        customers (
          id,
          company_name,
          user_id
        )
      `)
      .eq("assigned_driver_id", driver.id)
      .eq("state", "delivered")
      .gte("delivered_at", oneWeekAgoISO)
      .order("delivered_at", { ascending: false });

    if (ordersError) throw ordersError;

    // Enrich orders with customer profile data (for customer name)
    if (orders && orders.length > 0) {
      const customerUserIds = Array.from(new Set(orders.map((o: any) => o.customers?.user_id).filter(Boolean)));
      
      if (customerUserIds.length > 0) {
        const { data: profiles } = await supabaseAdmin
          .from("profiles")
          .select("id, full_name, phone")
          .in("id", customerUserIds);

        const profileMap = new Map(profiles?.map((p: any) => [p.id, p]) || []);

        // Add customer profile data to orders
        orders.forEach((order: any) => {
          if (order.customers?.user_id) {
            order.customers.profiles = profileMap.get(order.customers.user_id) || null;
          }
        });
      }
    }

    res.json(orders || []);
  } catch (error: any) {
    // Handle PGRST116 error (no rows found) gracefully
    if (error?.code === 'PGRST116') {
      return res.json([]);
    }
    res.status(500).json({ error: error.message });
  }
});

// Mark order as en route (driver started delivery)
router.post("/orders/:orderId/start", async (req, res) => {
  const user = (req as any).user;
  const { orderId } = req.params;

  try {
    const { data: driver, error: driverError } = await supabaseAdmin
      .from("drivers")
      .select("id, user_id")
      .eq("user_id", user.id)
      .single();

    if (driverError) throw driverError;
    if (!driver) {
      return res.status(404).json({ error: "Driver profile not found" });
    }

    const order = await fetchOrderForDriver(orderId, driver.id);

    if (!order) {
      return res.status(404).json({ error: "Order not found or not assigned to you" });
    }

    if (order.state !== "assigned") {
      return res.status(409).json({ error: "Delivery can only be started when the order is assigned" });
    }

    const nowIso = new Date().toISOString();

    const { error: updateError } = await supabaseAdmin
      .from("orders")
      .update({
        state: "en_route",
        updated_at: nowIso,
      })
      .eq("id", orderId)
      .eq("assigned_driver_id", driver.id)
      .eq("state", "assigned");

    if (updateError) throw updateError;

    // Fetch full updated order data for WebSocket broadcast
    const fullOrderData = await fetchFullOrderData(orderId);
    
    // Broadcast order state change via WebSocket with full order data
    const customerUserId = order.customers?.user_id;
    if (customerUserId && fullOrderData) {
      websocketService.sendOrderUpdate(customerUserId, {
        type: "order_updated",
        orderId,
        order: fullOrderData,
      });
    }

    // Also notify driver
    websocketService.sendOrderUpdate(user.id, {
      type: "order_updated",
      orderId,
      order: fullOrderData,
    });

    await ensureChatThreadForAssignment({
      orderId,
      customerId: order.customer_id,
      driverId: driver.id,
      customerUserId: order.customers?.user_id,
      driverUserId: driver.user_id,
    });

    try {
      await supabaseAdmin
        .from("drivers")
        .update({ availability_status: "on_delivery", updated_at: nowIso })
        .eq("id", driver.id);
    } catch (availabilityError) {
    }

    await ensureChatThreadForAssignment({
      orderId,
      customerId: order.customer_id,
      driverId: driver.id,
      customerUserId: order.customers?.user_id,
      driverUserId: driver.user_id,
    });

    if (customerUserId) {
      const { data: driverProfile } = await supabaseAdmin
        .from("profiles")
        .select("full_name")
        .eq("id", user.id)
        .maybeSingle();
      
      const driverName = driverProfile?.full_name || "Your driver";
      const estimatedETA = order.confirmed_delivery_time 
        ? new Date(order.confirmed_delivery_time).toLocaleTimeString("en-ZA", { 
            hour: "2-digit", 
            minute: "2-digit" 
          })
        : "Soon";

      await orderNotifications.onDriverEnRoute(customerUserId, orderId, driverName, estimatedETA);
    }

    res.json({ success: true, state: "en_route" });
  } catch (error: any) {
    res.status(500).json({ error: error.message || "Failed to start delivery" });
  }
});

// Mark order as picked up (fuel collected)
router.post("/orders/:orderId/pickup", async (req, res) => {
  const user = (req as any).user;
  const { orderId } = req.params;

  try {
    const { data: driver, error: driverError } = await supabaseAdmin
      .from("drivers")
      .select("id, user_id")
      .eq("user_id", user.id)
      .single();

    if (driverError) throw driverError;
    if (!driver) {
      return res.status(404).json({ error: "Driver profile not found" });
    }

    const order = await fetchOrderForDriver(orderId, driver.id);

    if (!order) {
      return res.status(404).json({ error: "Order not found or not assigned to you" });
    }

    if (order.state !== "en_route") {
      return res.status(409).json({ error: "Fuel can only be marked as picked up when en route" });
    }

    const nowIso = new Date().toISOString();

    const { error: updateError } = await supabaseAdmin
      .from("orders")
      .update({
        state: "picked_up",
        updated_at: nowIso,
      })
      .eq("id", orderId)
      .eq("assigned_driver_id", driver.id)
      .eq("state", "en_route");

    if (updateError) throw updateError;

    // Fetch full updated order data for WebSocket broadcast
    const fullOrderData = await fetchFullOrderData(orderId);
    
    // Broadcast order state change via WebSocket with full order data
    const customerUserId = order.customers?.user_id;
    if (customerUserId && fullOrderData) {
      websocketService.sendOrderUpdate(customerUserId, {
        type: "order_updated",
        orderId,
        order: fullOrderData,
      });
    }

    // Also notify driver
    websocketService.sendOrderUpdate(user.id, {
      type: "order_updated",
      orderId,
      order: fullOrderData,
    });

    if (customerUserId) {
      const sent = websocketService.sendOrderUpdate(customerUserId, {
        type: "order_state_changed",
        orderId,
        state: "picked_up",
        order: fullOrderData,
      });

      pushNotificationService
        .sendOrderUpdate(
          customerUserId,
          orderId,
          "Fuel Collected",
          "Your driver has collected the fuel and is heading to you",
          { action: "view_order", state: "picked_up" }
        )
        .catch(() => {});

      try {
        await supabaseAdmin.from("notifications").insert({
          user_id: customerUserId,
          type: "system_alert",
          title: "Fuel Collected",
          message: "Your driver has collected the fuel and is en route to your location.",
          data: { orderId, state: "picked_up" },
        });
      } catch (notifError) {
      }

      if (!sent) {
      }
    }

    res.json({ success: true, state: "picked_up" });
  } catch (error: any) {
    res.status(500).json({ error: error.message || "Failed to mark pickup" });
  }
});

// Complete delivery with customer signature
router.post("/orders/:orderId/complete", async (req, res) => {
  const user = (req as any).user;
  const { orderId } = req.params;

  const parseResult = deliveryCompletionSchema.safeParse(req.body);

  if (!parseResult.success) {
    const message = parseResult.error.errors[0]?.message || "Invalid request body";
    return res.status(400).json({ error: message });
  }

  const { signatureData, signatureName } = parseResult.data;
  const normalizedSignatureName = signatureName?.trim() ? signatureName.trim() : null;

  try {
    const { data: driver, error: driverError } = await supabaseAdmin
      .from("drivers")
      .select("id, user_id")
      .eq("user_id", user.id)
      .single();

    if (driverError) throw driverError;
    if (!driver) {
      return res.status(404).json({ error: "Driver profile not found" });
    }

    const order = await fetchOrderForDriver(orderId, driver.id);

    if (!order) {
      return res.status(404).json({ error: "Order not found or not assigned to you" });
    }

    if (order.state !== "picked_up") {
      return res.status(409).json({ error: "Order must be picked up before completion" });
    }

    const nowIso = new Date().toISOString();

    const { error: updateError } = await supabaseAdmin
      .from("orders")
      .update({
        state: "delivered",
        delivered_at: nowIso,
        delivery_signature_data: signatureData,
        delivery_signature_name: normalizedSignatureName,
        delivery_signed_at: nowIso,
        updated_at: nowIso,
      })
      .eq("id", orderId)
      .eq("assigned_driver_id", driver.id)
      .eq("state", "picked_up");

    if (updateError) throw updateError;

    const updatedOrder = await fetchOrderForDriver(orderId, driver.id);

    if (!updatedOrder || updatedOrder.state !== "delivered") {
      return res.status(409).json({ error: "Order could not be marked as delivered. Please retry." });
    }

    // Fetch full updated order data for WebSocket broadcast
    const fullOrderData = await fetchFullOrderData(orderId);
    
    // Broadcast order completion via WebSocket with full order data
    const customerUserId = updatedOrder.customers?.user_id;
    if (customerUserId && fullOrderData) {
      websocketService.sendOrderUpdate(customerUserId, {
        type: "order_updated",
        orderId,
        order: fullOrderData,
      });
    }

    // Also notify driver
    websocketService.sendOrderUpdate(user.id, {
      type: "order_updated",
      orderId,
      order: fullOrderData,
    });

    try {
      await supabaseAdmin
        .from("drivers")
        .update({ availability_status: "available", updated_at: nowIso })
        .eq("id", driver.id);
    } catch (availabilityError) {
    }

    const orderShortId = updatedOrder.id.substring(0, 8).toUpperCase();
    const deliveryAddress = formatDeliveryAddress(updatedOrder);
    const deliveredAtFormatted = formatDateTimeForZA(updatedOrder.delivered_at || nowIso);
    const fuelTypeLabel = updatedOrder.fuel_types?.label || "Fuel";
    const litresDisplay = updatedOrder.litres ? String(updatedOrder.litres) : "0";

    // Fetch names/emails
    let customerProfile: any = null;
    let driverProfile: any = null;

    if (customerUserId) {
      const { data } = await supabaseAdmin
        .from("profiles")
        .select("full_name")
        .eq("id", customerUserId)
        .maybeSingle();
      customerProfile = data;
    }

    const { data: driverProfileData } = await supabaseAdmin
      .from("profiles")
      .select("full_name, phone")
      .eq("id", user.id)
      .maybeSingle();

    driverProfile = driverProfileData;

    const customerName = customerProfile?.full_name || updatedOrder.customers?.company_name || "Customer";
    const driverName = driverProfile?.full_name || "Driver";

    if (customerUserId) {
      await orderNotifications.onDeliveryComplete(
        customerUserId,
        orderId,
        Number(litresDisplay) || 0,
        fuelTypeLabel
      );
    }

    let customerEmail = customerUserId
      ? await getUserEmail(customerUserId)
      : null;

    if (!customerEmail) {
      if (updatedOrder.customers?.company_name) {
        customerEmail = `${updatedOrder.customers.company_name
          .toLowerCase()
          .replace(/\s+/g, ".")}@customer.easyfuel.ai`;
      } else {
        customerEmail = "customer@easyfuel.ai";
      }
    }

    let driverEmail = await getUserEmail(user.id);

    if (!driverEmail) {
      driverEmail = `${driverName.toLowerCase().replace(/\s+/g, ".")}@driver.easyfuel.ai`;
    }

    const emailPromises: Promise<void>[] = [];

    if (customerEmail) {
      emailPromises.push(
        sendDeliveryCompletionEmail({
          toEmail: customerEmail,
          recipientName: customerName,
          audience: "customer",
          orderNumber: orderShortId,
          fuelType: fuelTypeLabel,
          litres: litresDisplay,
          deliveryAddress,
          deliveredAt: deliveredAtFormatted,
          driverName,
          customerName,
          signatureName: normalizedSignatureName,
        }).catch(() => {})
      );
    }

    if (driverEmail) {
      emailPromises.push(
        sendDeliveryCompletionEmail({
          toEmail: driverEmail,
          recipientName: driverName,
          audience: "driver",
          orderNumber: orderShortId,
          fuelType: fuelTypeLabel,
          litres: litresDisplay,
          deliveryAddress,
          deliveredAt: deliveredAtFormatted,
          driverName,
          customerName,
          signatureName: normalizedSignatureName,
        }).catch(() => {})
      );
    }

    if (emailPromises.length > 0) {
      await Promise.all(emailPromises);
    }

    await cleanupChatForOrder(updatedOrder.id);

    res.json({ success: true, state: "delivered" });
  } catch (error: any) {
    res.status(500).json({ error: error.message || "Failed to complete delivery" });
  }
});

// Accept a dispatch offer
// Note: Pricing is now automatically calculated when order is created
// Drivers can still accept offers to acknowledge them, but pricing is pre-set
const driverOfferAcceptanceSchema = z.object({
  proposedDeliveryTime: z
    .string()
    .optional()
    .nullable(),
  pricePerKmCents: z
    .number()
    .int("Price per km must be a whole number")
    .min(0, "Price per km must be positive")
    .optional()
    .nullable(), // Optional - pricing is auto-calculated
  notes: z
    .string()
    .max(500, "Notes must be 500 characters or less")
    .optional()
    .or(z.literal(""))
    .nullable(),
});

router.post("/offers/:id/accept", async (req, res) => {
  const user = (req as any).user;
  const offerId = req.params.id;

  const parseResult = driverOfferAcceptanceSchema.safeParse({
    proposedDeliveryTime: req.body?.proposedDeliveryTime,
    pricePerKmCents: Number(req.body?.pricePerKmCents),
    notes: req.body?.notes,
  });

  try {
    if (!parseResult.success) {
      const message = parseResult.error.errors[0]?.message || "Invalid request body";
      return res.status(400).json({ error: message });
    }
    const { proposedDeliveryTime, pricePerKmCents, notes } = parseResult.data;

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

    // Check if this is a pending offer (order without dispatch offer yet)
    let offer: any = null;
    let orderId: string | null = null;
    
    if (offerId.startsWith("pending-")) {
      // This is a pending offer - extract order ID
      orderId = offerId.replace("pending-", "");
      
      // Fetch the order directly
      const { data: order, error: orderError } = await supabaseAdmin
        .from("orders")
        .select("*")
        .eq("id", orderId)
        .eq("state", "created")
        .is("assigned_driver_id", null)
        .single();

      if (orderError || !order) {
        return res.status(404).json({ error: "Order not found or no longer available" });
      }

      // Create a synthetic object we will use to create a dispatch offer proposal
      offer = {
        id: null,
        order_id: orderId,
        driver_id: driver.id,
        state: "pending",
        orders: order,
      } as any;
    } else {
      // This is a regular dispatch offer
      const { data: fetchedOffer, error: offerCheckError } = await supabaseAdmin
        .from("dispatch_offers")
        .select("*, orders(*)")
        .eq("id", offerId)
        .eq("driver_id", driver.id)
        .single();

      if (offerCheckError) throw offerCheckError;
      if (!fetchedOffer) {
        return res.status(404).json({ error: "Offer not found" });
      }
      
      offer = fetchedOffer;
      orderId = offer.order_id;
    }

    // Check if offer has expired (only for regular offers, pending offers don't expire)
    if (!offerId.startsWith("pending-") && offer.expires_at && new Date(offer.expires_at) < new Date()) {
      return res.status(400).json({ error: "Offer has expired" });
    }

    // Check if order is still open for offers
    if (offer.orders.state !== "created" && offer.orders.state !== "awaiting_payment") {
      return res.status(409).json({
        error: "Order is no longer available to accept. Another driver may have been selected.",
      });
    }

    const nowIso = new Date().toISOString();
    let updatedOfferRecord: any = null;

    // Get admin-set price per km (pricing is now auto-calculated)
    const { data: appSettings } = await supabaseAdmin
      .from("app_settings")
      .select("price_per_km_cents")
      .eq("id", 1)
      .single();

    const adminPricePerKmCents = appSettings?.price_per_km_cents || 5000;
    // Use provided pricePerKmCents if given, otherwise use existing offer's price, otherwise use admin default
    const finalPricePerKmCents = pricePerKmCents ?? offer.proposed_price_per_km_cents ?? adminPricePerKmCents;

    if (offerId.startsWith("pending-")) {
      // Create a new dispatch offer record representing this proposal
      // Note: This path is less common now since offers are auto-created
      const { data: insertedOffer, error: insertError } = await supabaseAdmin
        .from("dispatch_offers")
        .insert({
          order_id: offer.order_id,
          driver_id: driver.id,
          state: "pending_customer",
          proposed_delivery_time: proposedDeliveryTime || null,
          proposed_price_per_km_cents: finalPricePerKmCents,
          proposed_notes: notes || null,
          expires_at: new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString(),
        })
        .select("*, orders(*)")
        .single();

      if (insertError || !insertedOffer) {
        return res.status(500).json({ error: "Failed to submit offer. Please try again." });
      }

      updatedOfferRecord = insertedOffer;
    } else {
      // Update existing dispatch offer (pricing is already set, just update notes/delivery time if provided)
      const updateData: any = {
        updated_at: nowIso,
      };

      // Only update fields if provided
      if (proposedDeliveryTime !== undefined && proposedDeliveryTime !== null) {
        updateData.proposed_delivery_time = proposedDeliveryTime;
      }
      if (notes !== undefined) {
        updateData.proposed_notes = notes || null;
      }
      // Pricing is auto-calculated, but allow override if explicitly provided
      if (pricePerKmCents !== undefined && pricePerKmCents !== null) {
        updateData.proposed_price_per_km_cents = pricePerKmCents;
      }

      // Only update state if it's still "offered" (offers are now created as "pending_customer")
      const { data: updatedOffer, error: updateOfferError } = await supabaseAdmin
        .from("dispatch_offers")
        .update(updateData)
        .eq("id", offerId)
        .eq("driver_id", driver.id)
        .in("state", ["offered", "pending_customer"])
        .select("*, orders(*)")
        .single();

      if (updateOfferError || !updatedOffer) {
        return res.status(409).json({
          error: "Offer is no longer available (may have been accepted by another driver or expired)",
        });
      }

      updatedOfferRecord = updatedOffer;
    }

    // Touch the order updated_at so it floats to the top for the customer
    await supabaseAdmin
      .from("orders")
      .update({ updated_at: nowIso })
      .eq("id", offer.order_id)
      .eq("state", offer.orders.state);

    // Fetch customer user id for notifications
    let customerUserId: string | null = null;
    if (updatedOfferRecord.orders?.customer_id) {
      const { data: customerLookup } = await supabaseAdmin
        .from("customers")
        .select("user_id, company_name")
        .eq("id", updatedOfferRecord.orders.customer_id)
        .single();
      customerUserId = customerLookup?.user_id || null;
    }

    // Fetch driver profile for names (for notifications)
    const { data: driverProfile } = await supabaseAdmin
      .from("profiles")
      .select("full_name, currency")
      .eq("id", user.id)
      .maybeSingle();

    if (customerUserId) {
      // Calculate estimated price based on distance (simplified for now)
      const estimatedPrice = (pricePerKmCents * 10) / 100; // Assuming 10km average
      const currency = driverProfile?.currency || "ZAR";

      // Notify customer about driver's offer
      await offerNotifications.onDriverOffer(
        customerUserId,
        updatedOfferRecord.id,
        updatedOfferRecord.order_id,
        driverProfile?.full_name || "A driver",
        estimatedPrice,
        currency,
        proposedDeliveryTime
      );

      // Broadcast offer update to customer via WebSocket
      websocketService.sendOrderUpdate(customerUserId, {
        type: "driver_offer_received",
        orderId: updatedOfferRecord.order_id,
        offerId: updatedOfferRecord.id,
        state: "pending_customer",
      });
    }

    res.json({
      success: true,
      message: "Quote submitted to customer",
      orderId: updatedOfferRecord.order_id,
      offerId: updatedOfferRecord.id,
      state: "pending_customer",
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message || "Failed to accept offer" });
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

    // Broadcast offer rejection - refresh offers list
    websocketService.sendToUser(user.id, {
      type: "offer_rejected",
      payload: { offerId },
    });

    res.json({ success: true, message: "Offer rejected successfully" });
  } catch (error: any) {
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

    // Create notification for new vehicle
    try {
      const vehicleDisplayName = vehicle.registration_number || `${vehicle.make || ''} ${vehicle.model || ''}`.trim() || 'new vehicle';
      const { error: notifError } = await supabaseAdmin.from("notifications").insert({
        user_id: user.id,
        type: "system_alert",
        title: "Vehicle Added",
        message: `Vehicle ${vehicleDisplayName} has been successfully added to your account`,
        data: { vehicleId: vehicle.id, registrationNumber: vehicle.registration_number },
      });
    } catch (err: any) {
    }

    // Broadcast vehicle creation
    websocketService.sendToUser(user.id, {
      type: "vehicle_created",
      payload: { vehicleId: vehicle.id },
    });

    // Transform to camelCase for frontend
    res.json(vehicleToCamelCase(vehicle));
  } catch (error: any) {
    
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

    // Create notification for vehicle update
    try {
      const vehicleDisplayName = vehicle.registration_number || `${vehicle.make || ''} ${vehicle.model || ''}`.trim() || 'your vehicle';
      const { error: notifError } = await supabaseAdmin.from("notifications").insert({
        user_id: user.id,
        type: "system_alert",
        title: "Vehicle Details Updated",
        message: `Vehicle ${vehicleDisplayName} details have been successfully updated`,
        data: { vehicleId: vehicle.id, registrationNumber: vehicle.registration_number },
      });
    } catch (err: any) {
    }

    // Broadcast vehicle update
    websocketService.sendToUser(user.id, {
      type: "vehicle_updated",
      payload: { vehicleId: vehicleId },
    });

    // Transform to camelCase for frontend
    res.json(vehicleToCamelCase(vehicle));
  } catch (error: any) {
    
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

    // Broadcast vehicle deletion
    websocketService.sendToUser(user.id, {
      type: "vehicle_deleted",
      payload: { vehicleId: vehicleId },
    });

    res.json({ success: true, message: "Vehicle deleted successfully" });
  } catch (error: any) {
    
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
      .select("id, fuel_type_id, fuel_price_per_liter_cents, active")
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
  const { fuelPricePerLiterCents, notes } = req.body;

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

    // Validate fuel price per liter
    if (fuelPricePerLiterCents === undefined || fuelPricePerLiterCents < 0) {
      return res.status(400).json({ error: "Invalid fuel price per liter" });
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
          fuel_price_per_liter_cents: fuelPricePerLiterCents,
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
        old_price_cents: existingPricing.fuel_price_per_liter_cents,
        new_price_cents: fuelPricePerLiterCents,
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
          fuel_price_per_liter_cents: fuelPricePerLiterCents,
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
        new_price_cents: fuelPricePerLiterCents,
        changed_by: user.id,
        notes: notes || null,
      });
    }

    res.json(updatedPricing);
  } catch (error: any) {
    
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
    const { latitude, longitude, orderId } = req.body;

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

    // If orderId is provided, verify the driver is assigned to this order and it's en_route or picked_up
    let activeOrderId: string | null = null;
    if (orderId) {
      const { data: order } = await supabaseAdmin
        .from("orders")
        .select("id, state")
        .eq("id", orderId)
        .eq("assigned_driver_id", driver.id)
        .in("state", ["en_route", "picked_up"])
        .maybeSingle();
      
      if (order) {
        activeOrderId = order.id;
      }
    } else {
      // If no orderId provided, check if driver has any en_route or picked_up orders
      const { data: activeOrder } = await supabaseAdmin
        .from("orders")
        .select("id")
        .eq("assigned_driver_id", driver.id)
        .in("state", ["en_route", "picked_up"])
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      
      if (activeOrder) {
        activeOrderId = activeOrder.id;
      }
    }

    // Update driver's current location (this serves as the default/fallback location)
    const nowIso = new Date().toISOString();
    const { error: updateError } = await supabaseAdmin
      .from("drivers")
      .update({
        current_lat: latitude,
        current_lng: longitude,
        updated_at: nowIso,
      })
      .eq("id", driver.id);

    if (updateError) throw updateError;

    // Also save to driver_locations table for history and real-time tracking
    // First, mark all previous locations as not current
    await supabaseAdmin
      .from("driver_locations")
      .update({ is_current: false })
      .eq("driver_id", driver.id)
      .eq("is_current", true);

    // Then insert the new location as current
    const { error: historyError } = await supabaseAdmin
      .from("driver_locations")
      .insert({
        driver_id: driver.id,
        order_id: activeOrderId || null,
        lat: latitude,
        lng: longitude,
        is_current: true,
        created_at: nowIso,
      });

    if (historyError) {
      console.error("Error saving location history:", historyError);
    }

    // Send real-time location update via WebSocket to customer if order is active
    if (activeOrderId) {
      try {
        // Get customer user ID for this order
        const { data: order } = await supabaseAdmin
          .from("orders")
          .select(`
            id,
            customers!inner(user_id)
          `)
          .eq("id", activeOrderId)
          .single();

        if (order?.customers?.user_id) {
          // Send location update to customer via WebSocket
          websocketService.sendLocationUpdate(order.customers.user_id, {
            orderId: activeOrderId,
            latitude,
            longitude,
            timestamp: nowIso,
          });
        }
      } catch (wsError) {
        // Don't fail the request if WebSocket fails
        console.error("Error sending location update via WebSocket:", wsError);
      }
    }

    res.json({ success: true, latitude, longitude });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Update driver profile
router.put("/profile", async (req, res) => {
  const user = (req as any).user;
  const { fullName, profilePhotoUrl } = req.body;
  
  try {
    // Update profile table
    const updateData: any = {
      updated_at: new Date().toISOString()
    };
    
    if (fullName) {
      updateData.full_name = fullName;
    }
    
    if (profilePhotoUrl) {
      updateData.profile_photo_url = profilePhotoUrl;
      console.log("Updating profile_photo_url:", profilePhotoUrl);
    }

    const { error: profileError } = await supabaseAdmin
      .from("profiles")
      .update(updateData)
      .eq("id", user.id);

    if (profileError) {
      console.error("Error updating profile:", profileError);
      throw profileError;
    }
    
    // Fetch updated profile to return the new photo URL
    const { data: updatedProfile } = await supabaseAdmin
      .from("profiles")
      .select("profile_photo_url")
      .eq("id", user.id)
      .single();
    
    console.log("Profile updated successfully. New profile_photo_url:", updatedProfile?.profile_photo_url);

    // Broadcast driver profile update
    websocketService.sendToUser(user.id, {
      type: "driver_profile_updated",
      payload: { userId: user.id },
    });

    res.json({ success: true, profile_photo_url: updatedProfile?.profile_photo_url });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Get driver documents
router.get("/documents", async (req, res) => {
  const user = (req as any).user;
  
  try {
    // Get driver ID
    const { data: driver, error: driverError } = await supabaseAdmin
      .from("drivers")
      .select("id")
      .eq("user_id", user.id)
      .maybeSingle();

    if (driverError) throw driverError;
    if (!driver) {
      return res.status(404).json({ error: "Driver profile not found" });
    }

    // Get documents for this driver
    // Try to query documents table, but handle if it doesn't exist
    const { data: documents, error: documentsError } = await supabaseAdmin
      .from("documents")
      .select("*")
      .eq("owner_type", "driver")
      .eq("owner_id", driver.id)
      .order("created_at", { ascending: false });

    if (documentsError) {
      // If table doesn't exist, return empty array instead of error
      if (documentsError.message?.includes("Could not find") || 
          documentsError.message?.includes("does not exist") ||
          documentsError.message?.includes("relation") ||
          documentsError.code === "42P01" || // PostgreSQL table doesn't exist
          documentsError.code === "PGRST116") {
        console.warn("Documents table not found, returning empty array");
        return res.json([]);
      }
      throw documentsError;
    }

    res.json(documents || []);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Upload driver document
router.post("/documents", async (req, res) => {
  const user = (req as any).user;
  const { doc_type, title, file_path, file_size, mime_type, expiry_date } = req.body;
  
  try {
    if (!doc_type || !file_path) {
      return res.status(400).json({ error: "doc_type and file_path are required" });
    }

    // Get driver ID
    const { data: driver, error: driverError } = await supabaseAdmin
      .from("drivers")
      .select("id")
      .eq("user_id", user.id)
      .maybeSingle();

    if (driverError) throw driverError;
    if (!driver) {
      return res.status(404).json({ error: "Driver profile not found" });
    }

    // Insert document
    const { data: document, error: insertError } = await supabaseAdmin
      .from("documents")
      .insert({
        owner_type: "driver",
        owner_id: driver.id,
        doc_type,
        title: title || doc_type,
        file_path,
        file_size: file_size || null,
        mime_type: mime_type || null,
        uploaded_by: user.id,
        expiry_date: expiry_date || null,
        verification_status: "pending",
      })
      .select()
      .single();

    if (insertError) {
      // If table doesn't exist, provide helpful error message
      if (insertError.message?.includes("Could not find") || 
          insertError.message?.includes("does not exist") ||
          insertError.message?.includes("relation") ||
          insertError.code === "42P01" ||
          insertError.code === "PGRST116") {
        return res.status(500).json({ 
          error: "Documents table not found",
          message: "The documents table does not exist in the database. Please run database migrations to create it.",
          hint: "Run 'npm run db:push' or create the documents table manually in your Supabase database."
        });
      }
      throw insertError;
    }

    res.json(document);
  } catch (error: any) {
    console.error("Error uploading driver document:", error);
    res.status(500).json({ error: error.message || "Failed to upload document" });
  }
});

// ============== DRIVER DEPOT ORDERS ==============

// Get all depots with distance from driver's current location
router.get("/depots", async (req, res) => {
  const user = (req as any).user;

  try {
    // Check authentication
    if (!user || !user.id) {
      console.error("GET /driver/depots: User not authenticated", { hasUser: !!user, userId: user?.id });
      return res.status(401).json({ error: "User not authenticated" });
    }

    // Import distance utilities early
    const { calculateDistance, milesToKm } = await import("./utils/distance");

    // Get driver's current location
    // Use maybeSingle() to handle case where driver profile doesn't exist yet
    const { data: driver, error: driverError } = await supabaseAdmin
      .from("drivers")
      .select("id, current_lat, current_lng")
      .eq("user_id", user.id)
      .maybeSingle();

    if (driverError) {
      console.error("Error fetching driver profile:", driverError);
      return res.status(500).json({ 
        error: "Failed to fetch driver profile", 
        details: driverError.message,
        code: driverError.code 
      });
    }
    
    if (!driver) {
      // Return empty array instead of error - driver might not have created profile yet
      console.warn(`[GET /driver/depots] Driver profile not found for user ${user.id}`);
      return res.json([]);
    }

    // Get all depots with their pricing and supplier info
    // First try with is_active column, fallback if column doesn't exist
    let depots: any[] = [];
    let depotsError: any = null;
    
    // Try query with is_active column first
    const queryWithActive = supabaseAdmin
      .from("depots")
      .select(`
        id,
        supplier_id,
        name,
        lat,
        lng,
        open_hours,
        notes,
        is_active,
        address_street,
        address_city,
        address_province,
        address_postal_code,
        created_at,
        updated_at,
        depot_prices (
          id,
          fuel_type_id,
          price_cents,
          min_litres,
          available_litres,
          fuel_types (
            id,
            label,
            code
          )
        ),
        suppliers (
          id,
          name
        )
      `)
      .eq("is_active", true)
      .order("name");

    const resultWithActive = await queryWithActive;
    depots = resultWithActive.data || [];
    depotsError = resultWithActive.error;
    
    console.log(`[GET /driver/depots] Query with is_active: ${depots.length} depots found, error: ${depotsError ? depotsError.message : 'none'}`);

    // If error is about missing column, try without is_active filter
    if (depotsError && (depotsError.message?.includes("is_active") || depotsError.message?.includes("column") || depotsError.code === "42703" || depotsError.code === "PGRST116")) {
      console.warn("is_active column doesn't exist, fetching all depots without filter");
      const queryWithoutActive = supabaseAdmin
        .from("depots")
        .select(`
          id,
          supplier_id,
          name,
          lat,
          lng,
          open_hours,
          notes,
          address_street,
          address_city,
          address_province,
          address_postal_code,
          created_at,
          updated_at,
          depot_prices (
            id,
            fuel_type_id,
            price_cents,
            min_litres,
            available_litres,
            fuel_types (
              id,
              label,
              code
            )
          ),
          suppliers (
            id,
            name
          )
        `)
        .order("name");
      
      const resultWithoutActive = await queryWithoutActive;
      if (resultWithoutActive.error) {
        console.error("Error fetching depots (fallback):", resultWithoutActive.error);
        throw resultWithoutActive.error;
      }
      depots = resultWithoutActive.data || [];
    } else if (depotsError) {
      console.error("Error fetching depots:", depotsError);
      throw depotsError;
    }

    // Filter in-memory to ensure only active depots are returned
    // This handles cases where is_active might be null or undefined (backward compatibility)
    const activeDepots = (depots || []).filter((depot: any) => {
      // If is_active is undefined/null, treat as active (for backward compatibility)
      return depot.is_active !== false;
    });

    // Calculate distance for each depot if driver has location
    
    const depotsWithDistance = activeDepots.map((depot: any) => {
      let distanceKm = null;
      let distanceMiles = null;

      if (driver.current_lat && driver.current_lng && depot.lat && depot.lng) {
        distanceMiles = calculateDistance(
          driver.current_lat,
          driver.current_lng,
          depot.lat,
          depot.lng
        );
        distanceKm = milesToKm(distanceMiles);
      }

      return {
        ...depot,
        distance_km: distanceKm,
        distance_miles: distanceMiles,
      };
    });

    console.log(`[GET /driver/depots] Returning ${depotsWithDistance.length} depots`);
    res.json(depotsWithDistance);
  } catch (error: any) {
    console.error("Error fetching depots:", error);
    console.error("Error details:", {
      message: error.message,
      code: error.code,
      details: error.details,
      hint: error.hint,
    });
    res.status(500).json({ 
      error: error.message || "Failed to fetch depots",
      details: error.details,
      code: error.code 
    });
  }
});

// Get driver's depot orders
router.get("/depot-orders", async (req, res) => {
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

    // Get all depot orders for this driver
    const { data: orders, error: ordersError } = await supabaseAdmin
      .from("driver_depot_orders")
      .select(`
        *,
        depots (
          id,
          name,
          address_city,
          address_province,
          lat,
          lng
        ),
        fuel_types (
          id,
          label,
          code
        )
      `)
      .eq("driver_id", driver.id)
      .order("created_at", { ascending: false });

    if (ordersError) throw ordersError;

    res.json(orders || []);
  } catch (error: any) {
    console.error("Error fetching driver depot orders:", error);
    res.status(500).json({ error: error.message });
  }
});

// Create order from depot
router.post("/depot-orders", async (req, res) => {
  const user = (req as any).user;
  const { depotId, fuelTypeId, litres, pickupDate, notes } = req.body;

  try {
    // Validate inputs
    if (!depotId || !fuelTypeId || !litres) {
      return res.status(400).json({ 
        error: "depotId, fuelTypeId, and litres are required" 
      });
    }

    const litresNum = parseFloat(litres);
    if (isNaN(litresNum) || litresNum <= 0) {
      return res.status(400).json({ error: "Invalid litres value" });
    }

    // Validate pickup date if provided
    let pickupDateTimestamp = null;
    if (pickupDate) {
      pickupDateTimestamp = new Date(pickupDate).toISOString();
      if (isNaN(new Date(pickupDate).getTime())) {
        return res.status(400).json({ error: "Invalid pickup date format" });
      }
      // Ensure pickup date is in the future
      if (new Date(pickupDate) <= new Date()) {
        return res.status(400).json({ error: "Pickup date must be in the future" });
      }
    } else {
      return res.status(400).json({ error: "Pickup date is required" });
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

    // Verify depot exists and is active
    const { data: depot, error: depotError } = await supabaseAdmin
      .from("depots")
      .select("id, is_active")
      .eq("id", depotId)
      .single();

    if (depotError || !depot) {
      return res.status(404).json({ error: "Depot not found" });
    }

    if (!depot.is_active) {
      return res.status(400).json({ error: "Depot is not active" });
    }

    // Get all pricing tiers for this fuel type at this depot
    const { data: pricingTiers, error: priceError } = await supabaseAdmin
      .from("depot_prices")
      .select("id, price_cents, min_litres, available_litres")
      .eq("depot_id", depotId)
      .eq("fuel_type_id", fuelTypeId)
      .order("min_litres", { ascending: false }); // Order by min_litres descending

    if (priceError || !pricingTiers || pricingTiers.length === 0) {
      return res.status(400).json({ 
        error: "This fuel type is not available at this depot or pricing is not set" 
      });
    }

    // Find the appropriate pricing tier based on order quantity
    // Select the tier with the highest min_litres that is <= order quantity
    let selectedTier = null;
    for (const tier of pricingTiers) {
      if (litresNum >= parseFloat(tier.min_litres.toString())) {
        selectedTier = tier;
        break;
      }
    }

    // If no tier matches, use the tier with lowest min_litres (should be 0)
    if (!selectedTier) {
      selectedTier = pricingTiers[pricingTiers.length - 1];
    }

    // Validate order quantity is less than available stock
    const availableLitres = selectedTier.available_litres !== null && selectedTier.available_litres !== undefined
      ? parseFloat(selectedTier.available_litres.toString())
      : 0;
    
    if (availableLitres > 0 && litresNum >= availableLitres) {
      return res.status(400).json({ 
        error: `You can only order less than ${availableLitres}L. Available stock: ${availableLitres}L` 
      });
    }

    // Calculate total price using the selected tier's price
    const pricePerLitreCents = selectedTier.price_cents;
    const totalPriceCents = Math.round(pricePerLitreCents * litresNum);

    // Create the order
    const { data: order, error: orderError } = await supabaseAdmin
      .from("driver_depot_orders")
      .insert({
        driver_id: driver.id,
        depot_id: depotId,
        fuel_type_id: fuelTypeId,
        litres: litresNum.toString(),
        price_per_litre_cents: pricePerLitreCents,
        total_price_cents: totalPriceCents,
        status: "pending",
        pickup_date: pickupDateTimestamp,
        notes: notes || null,
      })
      .select(`
        *,
        depots (
          id,
          name,
          address_city,
          address_province
        ),
        fuel_types (
          id,
          label,
          code
        )
      `)
      .single();

    if (orderError) throw orderError;

    // Notify supplier about the new order
    const { data: depotWithSupplier } = await supabaseAdmin
      .from("depots")
      .select("supplier_id, suppliers!inner(owner_id)")
      .eq("id", depotId)
      .single();

    if (depotWithSupplier?.suppliers?.owner_id) {
      const { websocketService } = await import("./websocket");
      const { notificationService } = await import("./notification-service");
      
      // Get driver profile for name
      const { data: driverProfile } = await supabaseAdmin
        .from("profiles")
        .select("full_name")
        .eq("id", user.id)
        .single();

      const driverName = driverProfile?.full_name || "Driver";
      const fuelTypeLabel = order.fuel_types?.label || "Fuel";
      const depotName = order.depots?.name || "Depot";
      const totalPrice = order.total_price_cents / 100;
      const currency = "ZAR"; // You may want to get this from user profile or app settings

      // Send WebSocket update for real-time delivery
      websocketService.sendOrderUpdate(depotWithSupplier.suppliers.owner_id, {
        type: "new_driver_depot_order",
        orderId: order.id,
        depotId,
        driverId: driver.id,
      });

      // Create notification for supplier
      await notificationService.notifyDriverDepotOrderPlaced(
        depotWithSupplier.suppliers.owner_id,
        order.id,
        depotName,
        fuelTypeLabel,
        litresNum,
        totalPrice,
        currency,
        pickupDateTimestamp!,
        driverName
      );
    }

    res.status(201).json(order);
  } catch (error: any) {
    console.error("Error creating depot order:", error);
    res.status(500).json({ error: error.message });
  }
});

// Cancel depot order (only if pending)
router.post("/depot-orders/:orderId/cancel", async (req, res) => {
  const user = (req as any).user;
  const { orderId } = req.params;

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

    // Check if order exists and belongs to driver
    const { data: order, error: orderError } = await supabaseAdmin
      .from("driver_depot_orders")
      .select(`
        *,
        depots (
          id,
          name,
          supplier_id,
          suppliers!inner(owner_id)
        ),
        fuel_types (
          id,
          label,
          code
        )
      `)
      .eq("id", orderId)
      .eq("driver_id", driver.id)
      .single();

    if (orderError || !order) {
      return res.status(404).json({ error: "Order not found" });
    }

    // Only pending orders can be cancelled
    if (order.status !== "pending") {
      return res.status(400).json({ 
        error: "Only pending orders can be cancelled" 
      });
    }

    // Get current order status before updating
    const currentStatus = order.status;
    const orderLitres = parseFloat(order.litres || "0");

    // Update order status
    const { data: updatedOrder, error: updateError } = await supabaseAdmin
      .from("driver_depot_orders")
      .update({
        status: "cancelled",
        updated_at: new Date().toISOString(),
      })
      .eq("id", orderId)
      .select(`
        *,
        depots (
          id,
          supplier_id,
          suppliers!inner(owner_id)
        )
      `)
      .single();

    if (updateError) throw updateError;

    // Pending orders don't reduce stock, so no need to restore stock when cancelling
    // Stock is only deducted when supplier confirms the order (pending -> confirmed)
    // Since we only allow cancelling pending orders, no stock restoration is needed

    // Notify supplier about cancellation
    if (order.depots?.suppliers?.owner_id) {
      const { websocketService } = await import("./websocket");
      const { notificationService } = await import("./notification-service");
      
      const depotName = order.depots?.name || "Depot";
      const fuelTypeLabel = order.fuel_types?.label || "Fuel";
      const litres = parseFloat(order.litres || "0");
      const reason = req.body.reason;

      // Send WebSocket update for real-time delivery
      websocketService.sendOrderUpdate(order.depots.suppliers.owner_id, {
        type: "driver_depot_order_cancelled",
        orderId: updatedOrder.id,
        status: "cancelled",
      });

      // Create notification for supplier and driver
      await notificationService.notifyDriverDepotOrderCancelled(
        order.depots.suppliers.owner_id,
        user.id,
        updatedOrder.id,
        depotName,
        fuelTypeLabel,
        litres,
        reason
      );
    }

    res.json(updatedOrder);
  } catch (error: any) {
    console.error("Error cancelling depot order:", error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
