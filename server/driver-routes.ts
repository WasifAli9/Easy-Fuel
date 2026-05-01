import { Router } from "express";
import { db, pool } from "./db";
import { createDrizzleCompat } from "./drizzle-compat";
import { sendDriverAcceptanceEmail, sendDeliveryCompletionEmail } from "./email-service";
import { insertDriverPricingSchema, insertPricingHistorySchema } from "@shared/schema";
import { websocketService } from "./websocket";
import { pushNotificationService } from "./push-service";
import { cleanupChatForOrder, ensureChatThreadForAssignment } from "./chat-service";
import { offerNotifications, orderNotifications } from "./notification-helpers";
import { getDriverComplianceStatus, getVehicleComplianceStatus, canDriverAccessPlatform } from "./compliance-service";
import { getDriverSubscription, getDriverActiveSubscription, driverHasActiveSubscription, getDriverMaxRadiusMiles } from "./subscription-service";
import { buildPaymentRedirectUrl, isOzowConfigured } from "./ozow-service";
import { vehicleToCamelCase, syncDriverVehicleCapacityLitres } from "./vehicle-utils";
import { SUBSCRIPTION_PLANS, PLAN_CODES, getPlan, type PlanCode } from "@shared/subscription-plans";
import { z } from "zod";
import dotenv from "dotenv";
import { normalizeSignatureForStorage, uploadUrlToObjectPath } from "./local-object-storage";
dotenv.config();

const router = Router();
const drizzleAdmin = createDrizzleCompat(db);

async function fetchHydratedDriverDepotOrder(orderId: string, driverId: string) {
  const r = await pool.query(
    `SELECT o.*,
            json_build_object(
              'id', d.id,
              'name', d.name,
              'address_street', d.address_street,
              'address_city', d.address_city,
              'address_province', d.address_province,
              'address_postal_code', d.address_postal_code,
              'lat', d.lat,
              'lng', d.lng,
              'supplier_id', d.supplier_id,
              'suppliers', (
                SELECT json_build_object('owner_id', s.owner_id)
                FROM suppliers s
                WHERE s.id = d.supplier_id
                LIMIT 1
              )
            ) AS depots,
            json_build_object('id', ft.id, 'label', ft.label, 'code', ft.code) AS fuel_types
     FROM driver_depot_orders o
     LEFT JOIN depots d ON d.id = o.depot_id
     LEFT JOIN fuel_types ft ON ft.id = o.fuel_type_id
     WHERE o.id = $1 AND o.driver_id = $2
     LIMIT 1`,
    [orderId, driverId]
  );
  return r.rows[0] ?? null;
}

// Helper middleware to check driver compliance
async function checkDriverCompliance(req: any, res: any, next: any) {
  try {
    const user = req.user;
    const { data: driver } = await drizzleAdmin
      .from("drivers")
      .select("id, status, compliance_status")
      .eq("user_id", user.id)
      .maybeSingle();

    if (!driver) {
      return res.status(404).json({ error: "Driver not found" });
    }

    if (driver.status !== "active" || driver.compliance_status !== "approved") {
      return res.status(403).json({
        error: "Compliance not approved",
        code: "COMPLIANCE_REQUIRED",
        message: "Your compliance documents must be approved before accessing this feature. Please complete your compliance profile.",
        status: driver.status,
        compliance_status: driver.compliance_status,
      });
    }

    req.driverId = driver.id;
    next();
  } catch (error: any) {
    console.error("Error checking driver compliance:", error);
    res.status(500).json({ error: error.message });
  }
}

// Get driver profile
router.get("/profile", async (req, res) => {
  const user = (req as any).user;
  
  try {
    // Get profile data (includes currency)
    const { data: profile, error: profileError } = await drizzleAdmin
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
    
    // Get driver-specific data
    const { data: driver, error: driverError } = await drizzleAdmin
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
      const { data: newDriver, error: createError } = await drizzleAdmin
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
          const { data: existingDriver } = await drizzleAdmin
            .from("drivers")
            .select("*")
            .eq("user_id", user.id)
            .maybeSingle();
          
          if (existingDriver) {
            // Driver exists, use it
            // Map phone to mobile_number and id fields
            const idType = existingDriver.id_type || null;
            let idNumber = null;
            if (idType) {
              const normalizedIdType = String(idType).toUpperCase();
              if (normalizedIdType === 'SA_ID' || normalizedIdType === 'SOUTH_AFRICA') {
                idNumber = existingDriver.za_id_number || null;
              } else if (normalizedIdType === 'PASSPORT') {
                idNumber = existingDriver.passport_number || null;
              }
            } else {
              idNumber = existingDriver.za_id_number || existingDriver.passport_number || null;
            }
            
            // Helper function to format date for HTML date input
            const formatDateForInput = (dateValue: any): string | null => {
              if (!dateValue) return null;
              try {
                // If it's already in YYYY-MM-DD format, return as-is
                if (typeof dateValue === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateValue)) {
                  return dateValue;
                }
                // If it's an ISO timestamp string (e.g., "2025-12-13T00:00:00"), extract just the date part
                if (typeof dateValue === 'string' && dateValue.includes('T')) {
                  const datePart = dateValue.split('T')[0];
                  if (/^\d{4}-\d{2}-\d{2}$/.test(datePart)) {
                    return datePart;
                  }
                }
                // Otherwise, try to parse as Date
                const date = new Date(dateValue);
                if (isNaN(date.getTime())) return null;
                const year = date.getFullYear();
                const month = String(date.getMonth() + 1).padStart(2, '0');
                const day = String(date.getDate()).padStart(2, '0');
                return `${year}-${month}-${day}`;
              } catch (e) {
                return null;
              }
            };
            
            return res.json({
              ...profile,
              ...existingDriver,
              mobile_number: profile.phone || null,
              id_number: idNumber,
              license_number: existingDriver.drivers_license_number || null,
              license_issue_date: formatDateForInput(existingDriver.drivers_license_issue_date),
              license_expiry_date: formatDateForInput(existingDriver.drivers_license_expiry),
              prdp_number: existingDriver.prdp_number ?? null,
              prdp_issue_date: formatDateForInput(existingDriver.prdp_issue_date),
              prdp_expiry_date: formatDateForInput(existingDriver.prdp_expiry),
              dg_training_issue_date: formatDateForInput(existingDriver.dg_training_issue_date),
              dg_training_expiry_date: formatDateForInput(existingDriver.dg_training_expiry_date),
              criminal_check_date: formatDateForInput(existingDriver.criminal_check_date),
              company_id: existingDriver.company_id || null,
              bank_account_holder: existingDriver.bank_account_name || null,
              email: user.email || null
            });
          }
        }
        throw createError;
      }

      // Map phone to mobile_number and id fields
      const idType = newDriver.id_type || null;
      let idNumber = null;
      if (idType) {
        const normalizedIdType = String(idType).toUpperCase();
        if (normalizedIdType === 'SA_ID' || normalizedIdType === 'SOUTH_AFRICA') {
          idNumber = newDriver.za_id_number || null;
        } else if (normalizedIdType === 'PASSPORT') {
          idNumber = newDriver.passport_number || null;
        }
      } else {
        idNumber = newDriver.za_id_number || newDriver.passport_number || null;
      }
      
      // Helper function to format date for HTML date input
      const formatDateForInput = (dateValue: any): string | null => {
        if (!dateValue) return null;
        try {
          // If it's already in YYYY-MM-DD format, return as-is
          if (typeof dateValue === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateValue)) {
            return dateValue;
          }
          // If it's an ISO timestamp string (e.g., "2025-12-13T00:00:00"), extract just the date part
          if (typeof dateValue === 'string' && dateValue.includes('T')) {
            const datePart = dateValue.split('T')[0];
            if (/^\d{4}-\d{2}-\d{2}$/.test(datePart)) {
              return datePart;
            }
          }
          // Otherwise, try to parse as Date
          const date = new Date(dateValue);
          if (isNaN(date.getTime())) return null;
          const year = date.getFullYear();
          const month = String(date.getMonth() + 1).padStart(2, '0');
          const day = String(date.getDate()).padStart(2, '0');
          return `${year}-${month}-${day}`;
        } catch (e) {
          return null;
        }
      };

      return res.json({
        ...profile,
        ...newDriver,
        mobile_number: profile.phone || null,
        id_number: idNumber,
        license_number: newDriver.drivers_license_number || null,
        license_issue_date: formatDateForInput(newDriver.drivers_license_issue_date),
        license_expiry_date: formatDateForInput(newDriver.drivers_license_expiry),
        prdp_number: newDriver.prdp_number ?? null,
        prdp_issue_date: formatDateForInput(newDriver.prdp_issue_date),
        prdp_expiry_date: formatDateForInput(newDriver.prdp_expiry),
        dg_training_issue_date: formatDateForInput(newDriver.dg_training_issue_date),
        dg_training_expiry_date: formatDateForInput(newDriver.dg_training_expiry_date),
        criminal_check_date: formatDateForInput(newDriver.criminal_check_date),
        company_id: newDriver.company_id || null,
        bank_account_holder: newDriver.bank_account_name || null,
        email: user.email || null
      });
    }

    // Combine profile, driver, and email data
    // Map phone to mobile_number for frontend compatibility
    // Map za_id_number/passport_number back to id_number based on id_type
    const idType = driver.id_type || null;
    let idNumber = null;
    if (idType) {
      const normalizedIdType = String(idType).toUpperCase();
      if (normalizedIdType === 'SA_ID' || normalizedIdType === 'SOUTH_AFRICA') {
        idNumber = driver.za_id_number || null;
      } else if (normalizedIdType === 'PASSPORT') {
        idNumber = driver.passport_number || null;
      }
    } else {
      // If no id_type set, try to use whichever one exists
      idNumber = driver.za_id_number || driver.passport_number || null;
    }
    
    // Helper function to format date for HTML date input (YYYY-MM-DD)
    const formatDateForInput = (dateValue: any): string | null => {
      if (!dateValue) return null;
      try {
        // If it's already in YYYY-MM-DD format, return as-is
        if (typeof dateValue === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateValue)) {
          return dateValue;
        }
        // If it's an ISO timestamp string (e.g., "2025-12-13T00:00:00"), extract just the date part
        if (typeof dateValue === 'string' && dateValue.includes('T')) {
          const datePart = dateValue.split('T')[0];
          if (/^\d{4}-\d{2}-\d{2}$/.test(datePart)) {
            return datePart;
          }
        }
        // Otherwise, try to parse as Date
        const date = new Date(dateValue);
        if (isNaN(date.getTime())) return null;
        // Format as YYYY-MM-DD for HTML date input
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
      } catch (e) {
        return null;
      }
    };
    
    // Create a cleaned driver object, removing raw date fields that will be formatted
    const cleanedDriver = { ...driver };
    // Remove raw database date field names to prevent ISO timestamps from appearing
    delete cleanedDriver.drivers_license_issue_date;
    delete cleanedDriver.drivers_license_expiry;
    delete cleanedDriver.prdp_issue_date;
    delete cleanedDriver.prdp_expiry;
    delete cleanedDriver.dg_training_issue_date;
    delete cleanedDriver.dg_training_expiry_date;
    delete cleanedDriver.criminal_check_date;
    
    const response = {
      ...profile,
      ...cleanedDriver,
      mobile_number: profile.phone || null,
      id_number: idNumber,
      // Explicitly set formatted date fields with frontend field names
      license_number: driver.drivers_license_number || null,
      license_issue_date: formatDateForInput(driver.drivers_license_issue_date),
      license_expiry_date: formatDateForInput(driver.drivers_license_expiry),
      // Explicitly include PrDP fields (return as-is from database, preserve empty strings)
      prdp_number: driver.hasOwnProperty('prdp_number') ? (driver.prdp_number || '') : null,
      prdp_issue_date: formatDateForInput(driver.prdp_issue_date),
      prdp_expiry_date: formatDateForInput(driver.prdp_expiry),
      dg_training_issue_date: formatDateForInput(driver.dg_training_issue_date),
      dg_training_expiry_date: formatDateForInput(driver.dg_training_expiry_date),
      criminal_check_date: formatDateForInput(driver.criminal_check_date),
      // Explicitly include company fields (return as-is from database)
      company_id: driver.hasOwnProperty('company_id') ? driver.company_id : null,
      bank_account_holder: driver.bank_account_name || null,
      email: user.email || null
    };
    
    
    res.json(response);
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
    const { data: order, error: orderError } = await drizzleAdmin
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
        const { data: customerProfile } = await drizzleAdmin
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
    const { data: driver, error: driverError } = await drizzleAdmin
      .from("drivers")
      .select("*")
      .eq("id", driverId)
      .single();

    if (driverError || !driver) {
      throw new Error("Driver not found");
    }

    // Get driver's profile for name
    const { data: driverProfile, error: driverProfileError } = 
      await drizzleAdmin
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
  const { data: order, error } = await drizzleAdmin
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
  const { data: order, error } = await drizzleAdmin
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
    const { data, error } = await drizzleAdmin.auth.admin.getUserById(userId);
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
    let { data: driver, error: driverError } = await drizzleAdmin
      .from("drivers")
      .select("id, kyc_status, current_lat, current_lng, job_radius_preference_miles")
      .eq("user_id", user.id)
      .maybeSingle();

    if (driverError) throw driverError;
    
    // If no driver record, create it automatically
    if (!driver) {
      const { data: newDriver, error: createError } = await drizzleAdmin
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
    let { data: driver, error: driverError } = await drizzleAdmin
      .from("drivers")
      .select("id")
      .eq("user_id", user.id)
      .maybeSingle();

    if (driverError) throw driverError;

    if (!driver) {
      const { data: newDriver, error: createError } = await drizzleAdmin
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

    const weekStartDate = startOfWeek;

    // Active jobs (assigned / en route / picked up)
    const { count: activeJobsCount, error: activeError } = await drizzleAdmin
      .from("orders")
      .select("*", { count: "exact", head: true })
      .eq("assigned_driver_id", driver.id)
      .in("state", ["assigned", "en_route", "picked_up"]);

    if (activeError) throw activeError;

    // This week's earnings (delivered this week)
    const { data: thisWeekOrders, error: weekError } = await drizzleAdmin
      .from("orders")
      .select("delivery_fee_cents, total_cents")
      .eq("assigned_driver_id", driver.id)
      .eq("state", "delivered")
      .gte("delivered_at", weekStartDate);

    if (weekError) throw weekError;

    const todayEarningsCents = (thisWeekOrders || []).reduce((sum, order: any) => {
      const deliveryFee = Number(order.delivery_fee_cents) || 0;
      const total = Number(order.total_cents) || 0;
      return sum + (deliveryFee > 0 ? deliveryFee : total);
    }, 0);

    // Completed deliveries this week
    const { data: completedThisWeekOrders, error: completedError } = await drizzleAdmin
      .from("orders")
      .select("id")
      .eq("assigned_driver_id", driver.id)
      .eq("state", "delivered")
      .gte("delivered_at", weekStartDate);

    if (completedError) throw completedError;

    const completedThisWeek = completedThisWeekOrders?.length || 0;

    // Lifetime totals
    const { data: deliveredOrders, error: deliveredError } = await drizzleAdmin
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

    const detail = (req as any).query?.detail;
    const activeSub = await getDriverActiveSubscription(driver.id);
    const canAdvanced = activeSub && (activeSub.planCode === "professional" || activeSub.planCode === "premium");
    const payload: any = {
      activeJobs: activeJobsCount || 0,
      todayEarningsCents,
      completedThisWeek,
      totalEarningsCents,
      totalDeliveries,
    };
    if (detail === "advanced" && canAdvanced) {
      const { data: ordersWithFuel } = await drizzleAdmin
        .from("orders")
        .select("id, delivery_fee_cents, total_cents, fuel_price_cents, litres, delivered_at, fuel_types(label)")
        .eq("assigned_driver_id", driver.id)
        .eq("state", "delivered")
        .order("delivered_at", { ascending: false });
      const byWeek: Record<string, number> = {};
      const byFuelType: Record<string, number> = {};
      const fuelCostByDelivery: { id: string; deliveredAt: string; litres: number; fuelType: string; fuelCostCents: number; deliveryFeeCents: number }[] = [];
      let totalFuelCostCents = 0;
      (ordersWithFuel || []).forEach((o: any) => {
        const cents = Number(o.delivery_fee_cents) || Number(o.total_cents) || 0;
        const label = o.fuel_types?.label || "Other";
        byFuelType[label] = (byFuelType[label] || 0) + cents;
        if (o.delivered_at) {
          const d = new Date(o.delivered_at);
          const weekKey = `${d.getFullYear()}-W${String(Math.ceil(d.getDate() / 7)).padStart(2, "0")}`;
          byWeek[weekKey] = (byWeek[weekKey] || 0) + cents;
        }
        const litresNum = parseFloat(o.litres) || 0;
        const pricePerLitreCents = Number(o.fuel_price_cents) || 0;
        const fuelCostCents = Math.round(pricePerLitreCents * litresNum);
        totalFuelCostCents += fuelCostCents;
        if (fuelCostByDelivery.length < 15) {
          fuelCostByDelivery.push({
            id: o.id,
            deliveredAt: o.delivered_at,
            litres: litresNum,
            fuelType: label,
            fuelCostCents,
            deliveryFeeCents: Number(o.delivery_fee_cents) || 0,
          });
        }
      });
      payload.earningsByWeek = byWeek;
      payload.earningsByFuelType = byFuelType;
      payload.fuelCostByDelivery = fuelCostByDelivery;
      payload.totalFuelCostCents = totalFuelCostCents;
    }
    res.json(payload);
  } catch (error: any) {
    res.status(500).json({ error: error.message || "Failed to fetch stats" });
  }
});

// GET /api/driver/stats/export?format=csv – Premium only
router.get("/stats/export", async (req, res) => {
  const user = (req as any).user;
  const format = (req as any).query?.format || "csv";
  try {
    const { data: driver } = await drizzleAdmin.from("drivers").select("id").eq("user_id", user.id).maybeSingle();
    if (!driver) return res.status(404).json({ error: "Driver not found" });
    const activeSub = await getDriverActiveSubscription(driver.id);
    if (!activeSub || activeSub.planCode !== "premium") {
      return res.status(403).json({ error: "Export is available on Premium only", code: "SUBSCRIPTION_REQUIRED" });
    }
    const { data: orders } = await drizzleAdmin
      .from("orders")
      .select("id, total_cents, delivery_fee_cents, litres, delivered_at, fuel_types(label)")
      .eq("assigned_driver_id", driver.id)
      .eq("state", "delivered")
      .order("delivered_at", { ascending: false });
    if (format === "csv") {
      const header = "Date,Delivery fee (R),Total (R),Litres,Fuel type\n";
      const rows = (orders || []).map((o: any) => {
        const d = o.delivered_at ? new Date(o.delivered_at).toISOString().split("T")[0] : "";
        const fee = ((Number(o.delivery_fee_cents) || 0) / 100).toFixed(2);
        const total = ((Number(o.total_cents) || 0) / 100).toFixed(2);
        const label = (o.fuel_types?.label || "").replace(/"/g, '""');
        return `${d},${fee},${total},${o.litres || ""},"${label}"`;
      });
      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", "attachment; filename=earnings-export.csv");
      return res.send(header + rows.join("\n"));
    }
    res.status(400).json({ error: "Unsupported format. Use format=csv" });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// Get driver's assigned orders (accepted deliveries)
// Note: This route is accessible without compliance approval - will return empty array if not compliant
router.get("/assigned-orders", async (req, res) => {
  const user = (req as any).user;

  try {
    // Get driver ID from user ID
    let { data: driver, error: driverError } = await drizzleAdmin
      .from("drivers")
      .select("id")
      .eq("user_id", user.id)
      .maybeSingle();

    if (driverError) throw driverError;
    
    // If no driver record, return empty array (driver hasn't completed setup)
    if (!driver) {
      return res.json([]);
    }

    // Check if driver is compliant - if not, return empty array (no orders will be assigned)
    const { data: driverStatus } = await drizzleAdmin
      .from("drivers")
      .select("status, compliance_status")
      .eq("id", driver.id)
      .single();
    
    if (!driverStatus || driverStatus.status !== "active" || driverStatus.compliance_status !== "approved") {
      return res.json([]);
    }

    // Fetch orders assigned to this driver
    const { data: orders, error: ordersError } = await drizzleAdmin
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
        const { data: profiles } = await drizzleAdmin
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
// Note: This route is accessible without compliance approval - will return empty array if not compliant
router.get("/completed-orders", async (req, res) => {
  const user = (req as any).user;

  try {
    // Get driver ID from user ID
    let { data: driver, error: driverError } = await drizzleAdmin
      .from("drivers")
      .select("id")
      .eq("user_id", user.id)
      .maybeSingle();

    if (driverError) throw driverError;
    
    // If no driver record, return empty array (driver hasn't completed setup)
    if (!driver) {
      return res.json([]);
    }

    // Check if driver is compliant - if not, return empty array (no orders will be completed)
    const { data: driverStatus } = await drizzleAdmin
      .from("drivers")
      .select("status, compliance_status")
      .eq("id", driver.id)
      .single();
    
    if (!driverStatus || driverStatus.status !== "active" || driverStatus.compliance_status !== "approved") {
      return res.json([]);
    }

    // Calculate date 7 days ago
    const oneWeekAgo = new Date();
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
    const oneWeekAgoDate = oneWeekAgo;

    // Fetch completed orders from the last week
    const { data: orders, error: ordersError } = await drizzleAdmin
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
      .gte("delivered_at", oneWeekAgoDate)
      .order("delivered_at", { ascending: false });

    if (ordersError) throw ordersError;

    // Enrich orders with customer profile data (for customer name)
    if (orders && orders.length > 0) {
      const customerUserIds = Array.from(new Set(orders.map((o: any) => o.customers?.user_id).filter(Boolean)));
      
      if (customerUserIds.length > 0) {
        const { data: profiles } = await drizzleAdmin
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
router.post("/orders/:orderId/start", checkDriverCompliance, requireActiveSubscription, async (req, res) => {
  const user = (req as any).user;
  const { orderId } = req.params;

  try {
    const { data: driver, error: driverError } = await drizzleAdmin
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

    const now = new Date();

    const { error: updateError } = await drizzleAdmin
      .from("orders")
      .update({
        state: "en_route",
        updated_at: now,
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
      await drizzleAdmin
        .from("drivers")
        .update({ availability_status: "on_delivery", updated_at: now })
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
      const { data: driverProfile } = await drizzleAdmin
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
router.post("/orders/:orderId/pickup", checkDriverCompliance, requireActiveSubscription, async (req, res) => {
  const user = (req as any).user;
  const { orderId } = req.params;

  try {
    const { data: driver, error: driverError } = await drizzleAdmin
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

    const now = new Date();

    const { error: updateError } = await drizzleAdmin
      .from("orders")
      .update({
        state: "picked_up",
        updated_at: now,
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
      const { data: driverProfile } = await drizzleAdmin
        .from("profiles")
        .select("full_name")
        .eq("id", user.id)
        .maybeSingle();
      const driverName = driverProfile?.full_name || "Your driver";

      await orderNotifications.onDeliveryStarted(customerUserId, orderId, driverName);

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
        await drizzleAdmin.from("notifications").insert({
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
router.post("/orders/:orderId/complete", checkDriverCompliance, requireActiveSubscription, async (req, res) => {
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
    const { data: driver, error: driverError } = await drizzleAdmin
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

    const now = new Date();

    const { error: updateError } = await drizzleAdmin
      .from("orders")
      .update({
        state: "delivered",
        delivered_at: now,
        delivery_signature_data: signatureData,
        delivery_signature_name: normalizedSignatureName,
        delivery_signed_at: now,
        updated_at: now,
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
      await drizzleAdmin
        .from("drivers")
        .update({ availability_status: "available", updated_at: now })
        .eq("id", driver.id);
    } catch (availabilityError) {
    }

    const orderShortId = updatedOrder.id.substring(0, 8).toUpperCase();
    const deliveryAddress = formatDeliveryAddress(updatedOrder);
    const deliveredAtFormatted = formatDateTimeForZA(updatedOrder.delivered_at || now.toISOString());
    const fuelTypeLabel = updatedOrder.fuel_types?.label || "Fuel";
    const litresDisplay = updatedOrder.litres ? String(updatedOrder.litres) : "0";

    // Fetch names/emails
    let customerProfile: any = null;
    let driverProfile: any = null;

    if (customerUserId) {
      const { data } = await drizzleAdmin
        .from("profiles")
        .select("full_name")
        .eq("id", customerUserId)
        .maybeSingle();
      customerProfile = data;
    }

    const { data: driverProfileData } = await drizzleAdmin
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

router.post("/offers/:id/accept", checkDriverCompliance, requireActiveSubscription, async (req, res) => {
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
    const { data: driver, error: driverError } = await drizzleAdmin
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
      const { data: order, error: orderError } = await drizzleAdmin
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
      const { data: fetchedOffer, error: offerCheckError } = await drizzleAdmin
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

    const now = new Date();
    let updatedOfferRecord: any = null;

    // Get admin-set price per km (pricing is now auto-calculated)
    const { data: appSettings } = await drizzleAdmin
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
      const { data: insertedOffer, error: insertError } = await drizzleAdmin
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
        updated_at: now,
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
      const { data: updatedOffer, error: updateOfferError } = await drizzleAdmin
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
    await drizzleAdmin
      .from("orders")
      .update({ updated_at: now })
      .eq("id", offer.order_id)
      .eq("state", offer.orders.state);

    // Fetch customer user id for notifications
    let customerUserId: string | null = null;
    if (updatedOfferRecord.orders?.customer_id) {
      const { data: customerLookup } = await drizzleAdmin
        .from("customers")
        .select("user_id, company_name")
        .eq("id", updatedOfferRecord.orders.customer_id)
        .single();
      customerUserId = customerLookup?.user_id || null;
    }

    // Fetch driver profile for names (for notifications)
    const { data: driverProfile } = await drizzleAdmin
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
    const { data: driver, error: driverError } = await drizzleAdmin
      .from("drivers")
      .select("id")
      .eq("user_id", user.id)
      .single();

    if (driverError) throw driverError;
    if (!driver) {
      return res.status(404).json({ error: "Driver profile not found" });
    }

    // Check if offer exists and belongs to this driver
    const { data: offer, error: offerCheckError } = await drizzleAdmin
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
    const { error: rejectError } = await drizzleAdmin
      .from("dispatch_offers")
      .update({ state: "rejected", updated_at: new Date() })
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
    const { data: driver, error: driverError } = await drizzleAdmin
      .from("drivers")
      .select("id")
      .eq("user_id", user.id)
      .single();

    if (driverError) throw driverError;
    if (!driver) {
      return res.status(404).json({ error: "Driver profile not found" });
    }

    // Get all vehicles for this driver
    const { data: vehicles, error: vehiclesError } = await drizzleAdmin
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
        error: "Database schema metadata needs refresh. Run 'NOTIFY pgrst, \"reload schema\";' in your PostgreSQL SQL tool and try again in 10 seconds.",
        code: 'SCHEMA_CACHE_ERROR'
      });
    }
    
    res.status(500).json({ error: error.message });
  }
});

/** Unassigned fleet vehicles for the driver's linked company (pool). Empty if independent or disabled by company. */
router.get("/company-fleet/available-vehicles", async (req, res) => {
  const user = (req as any).user;
  try {
    const { data: driver, error: dErr } = await drizzleAdmin
      .from("drivers")
      .select("id")
      .eq("user_id", user.id)
      .maybeSingle();
    if (dErr) throw dErr;
    if (!driver) return res.status(404).json({ error: "Driver profile not found" });

    const { data: mem, error: mErr } = await drizzleAdmin
      .from("driver_company_memberships")
      .select("company_id, is_disabled_by_company")
      .eq("driver_id", driver.id)
      .maybeSingle();
    if (mErr) throw mErr;
    if (!mem?.company_id || mem.is_disabled_by_company) {
      return res.json([]);
    }

    const { data: pool, error: pErr } = await drizzleAdmin
      .from("vehicles")
      .select("*")
      .eq("company_id", mem.company_id)
      .is("driver_id", null)
      .order("registration_number", { ascending: true });
    if (pErr) throw pErr;
    res.json((pool || []).map(vehicleToCamelCase));
  } catch (error: any) {
    console.error("GET /driver/company-fleet/available-vehicles:", error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Driver self-selects an unassigned company fleet vehicle.
 * Clears any other company-fleet assignment for this driver under the same company first.
 */
router.post("/vehicles/:vehicleId/claim-company-vehicle", async (req, res) => {
  const user = (req as any).user;
  const { vehicleId } = req.params;
  try {
    const { data: driver, error: dErr } = await drizzleAdmin
      .from("drivers")
      .select("id")
      .eq("user_id", user.id)
      .maybeSingle();
    if (dErr) throw dErr;
    if (!driver) return res.status(404).json({ error: "Driver profile not found" });

    const { data: mem, error: mErr } = await drizzleAdmin
      .from("driver_company_memberships")
      .select("company_id, is_disabled_by_company")
      .eq("driver_id", driver.id)
      .maybeSingle();
    if (mErr) throw mErr;
    if (!mem?.company_id) {
      return res.status(403).json({ error: "You are not linked to a fleet company" });
    }
    if (mem.is_disabled_by_company) {
      return res.status(403).json({ error: "Your fleet company has disabled your access" });
    }

    const { data: vehicle, error: vErr } = await drizzleAdmin
      .from("vehicles")
      .select("id, company_id, driver_id")
      .eq("id", vehicleId)
      .maybeSingle();
    if (vErr) throw vErr;
    if (!vehicle?.company_id) {
      return res.status(400).json({ error: "Not a company fleet vehicle" });
    }
    if (vehicle.company_id !== mem.company_id) {
      return res.status(403).json({ error: "This vehicle belongs to another company" });
    }
    if (vehicle.driver_id != null) {
      return res.status(400).json({ error: "This vehicle is already assigned" });
    }

    const { data: otherFleet, error: oErr } = await drizzleAdmin
      .from("vehicles")
      .select("id")
      .eq("driver_id", driver.id)
      .eq("company_id", mem.company_id);
    if (oErr) throw oErr;
    const now = new Date();
    for (const row of otherFleet || []) {
      await drizzleAdmin.from("vehicles").update({ driver_id: null, updated_at: now }).eq("id", (row as any).id);
    }
    await syncDriverVehicleCapacityLitres(driver.id);

    const { data: updated, error: uErr } = await drizzleAdmin
      .from("vehicles")
      .update({ driver_id: driver.id, updated_at: now })
      .eq("id", vehicleId)
      .select()
      .single();
    if (uErr) throw uErr;

    await syncDriverVehicleCapacityLitres(driver.id);

    websocketService.sendToUser(user.id, {
      type: "vehicle_updated",
      payload: { vehicleId },
    });

    res.json(vehicleToCamelCase(updated));
  } catch (error: any) {
    console.error("POST /driver/vehicles/claim-company-vehicle:", error);
    res.status(500).json({ error: error.message });
  }
});

// Add new vehicle for authenticated driver
router.post("/vehicles", async (req, res) => {
  const user = (req as any).user;

  try {
    // Get driver ID from user ID
    const { data: driver, error: driverError } = await drizzleAdmin
      .from("drivers")
      .select("id")
      .eq("user_id", user.id)
      .single();

    if (driverError) throw driverError;
    if (!driver) {
      return res.status(404).json({ error: "Driver profile not found" });
    }

    // Accept both snake_case and camelCase payload keys from web/mobile.
    const body = req.body ?? {};
    const registrationNumber = body.registration_number ?? body.registrationNumber ?? null;
    if (!registrationNumber || String(registrationNumber).trim().length === 0) {
      return res.status(400).json({ error: "Registration number is required" });
    }

    const insertResult = await pool.query(
      `INSERT INTO vehicles (
        driver_id, registration_number, make, model, year, capacity_litres, fuel_types,
        license_disk_expiry, roadworthy_expiry, insurance_expiry, tracker_installed, tracker_provider,
        vehicle_reg_certificate_number, roadworthy_certificate_number, roadworthy_issue_date,
        dg_vehicle_permit_required, vehicle_insured, loa_required, updated_at
      ) VALUES (
        $1,$2,$3,$4,$5,$6,$7,
        $8,$9,$10,$11,$12,
        $13,$14,$15,
        $16,$17,$18,now()
      )
      RETURNING *`,
      [
        driver.id,
        String(registrationNumber).trim(),
        body.make ?? null,
        body.model ?? null,
        body.year ?? null,
        body.capacity_litres ?? body.capacityLitres ?? null,
        body.fuel_types ?? body.fuelTypes ?? null,
        body.license_disk_expiry ?? body.licenseDiskExpiry ?? null,
        body.roadworthy_expiry ?? body.roadworthyExpiry ?? null,
        body.insurance_expiry ?? body.insuranceExpiry ?? null,
        body.tracker_installed ?? body.trackerInstalled ?? false,
        body.tracker_provider ?? body.trackerProvider ?? null,
        body.vehicle_reg_certificate_number ?? body.vehicleRegCertificateNumber ?? null,
        body.roadworthy_certificate_number ?? body.roadworthyCertificateNumber ?? null,
        body.roadworthy_issue_date ?? body.roadworthyIssueDate ?? null,
        body.dg_vehicle_permit_required ?? body.dgVehiclePermitRequired ?? false,
        body.vehicle_insured ?? body.vehicleInsured ?? false,
        body.loa_required ?? body.loaRequired ?? false,
      ]
    );

    let vehicle = insertResult.rows[0] as any;
    if (!vehicle) {
      throw new Error("Vehicle was created but could not be loaded.");
    }

    await syncDriverVehicleCapacityLitres(driver.id);

    // Create notification for new vehicle
    try {
      const vehicleDisplayName = vehicle.registration_number || `${vehicle.make || ''} ${vehicle.model || ''}`.trim() || 'new vehicle';
      const { error: notifError } = await drizzleAdmin.from("notifications").insert({
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
        error: "Database schema metadata needs refresh. Run 'NOTIFY pgrst, \"reload schema\";' in your PostgreSQL SQL tool and try again in 10 seconds.",
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
    const { data: driver, error: driverError } = await drizzleAdmin
      .from("drivers")
      .select("id")
      .eq("user_id", user.id)
      .single();

    if (driverError) throw driverError;
    if (!driver) {
      return res.status(404).json({ error: "Driver profile not found" });
    }

    // Verify vehicle belongs to this driver (personal or company-assigned fleet)
    const { data: existingVehicle, error: checkError } = await drizzleAdmin
      .from("vehicles")
      .select("id, company_id")
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
    const { data: vehicle, error: updateError } = await drizzleAdmin
      .from("vehicles")
      .update(updateData)
      .eq("id", vehicleId)
      .select()
      .single();

    if (updateError) throw updateError;

    await syncDriverVehicleCapacityLitres(driver.id);

    // Create notification for vehicle update
    try {
      const vehicleDisplayName = vehicle.registration_number || `${vehicle.make || ''} ${vehicle.model || ''}`.trim() || 'your vehicle';
      const { error: notifError } = await drizzleAdmin.from("notifications").insert({
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
        error: "Database schema metadata needs refresh. Run 'NOTIFY pgrst, \"reload schema\";' in your PostgreSQL SQL tool and try again in 10 seconds.",
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
    const { data: driver, error: driverError } = await drizzleAdmin
      .from("drivers")
      .select("id")
      .eq("user_id", user.id)
      .single();

    if (driverError) throw driverError;
    if (!driver) {
      return res.status(404).json({ error: "Driver profile not found" });
    }

    const { data: existingV, error: checkErr } = await drizzleAdmin
      .from("vehicles")
      .select("id, company_id")
      .eq("id", vehicleId)
      .eq("driver_id", driver.id)
      .maybeSingle();

    if (checkErr) throw checkErr;
    if (!existingV) {
      return res.status(404).json({ error: "Vehicle not found or access denied" });
    }
    if (existingV.company_id) {
      return res.status(403).json({
        error: "Company fleet vehicles cannot be deleted by drivers. Ask your fleet manager to unassign or remove the vehicle.",
      });
    }

    const { error: deleteError } = await drizzleAdmin.from("vehicles").delete().eq("id", vehicleId).eq("driver_id", driver.id);

    if (deleteError) throw deleteError;

    await syncDriverVehicleCapacityLitres(driver.id);

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
        error: "Database schema metadata needs refresh. Run 'NOTIFY pgrst, \"reload schema\";' in your PostgreSQL SQL tool and try again in 10 seconds.",
        code: 'SCHEMA_CACHE_ERROR'
      });
    }
    
    res.status(500).json({ error: error.message });
  }
});

// Get driver preferences (radius and location); radius is capped by subscription tier
router.get("/preferences", async (req, res) => {
  const user = (req as any).user;

  try {
    const { data: driver, error: driverError } = await drizzleAdmin
      .from("drivers")
      .select("id, job_radius_preference_miles, current_lat, current_lng")
      .eq("user_id", user.id)
      .single();

    if (driverError) throw driverError;
    if (!driver) {
      return res.status(404).json({ error: "Driver profile not found" });
    }

    const activeSub = await getDriverActiveSubscription(driver.id);
    const maxRadiusMiles = activeSub ? await getDriverMaxRadiusMiles(driver.id) : 0;
    // Radius is set by subscription plan only (no driver-editable preference)
    const effectiveRadiusMiles = maxRadiusMiles;

    res.json({
      jobRadiusPreferenceMiles: maxRadiusMiles,
      effectiveRadiusMiles,
      maxRadiusMiles,
      subscriptionTier: activeSub?.plan.deliveryRadius ?? null,
      subscriptionPlanName: activeSub?.plan.name ?? null,
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
    const { data: driver, error: driverError } = await drizzleAdmin
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
      const activeSub = await getDriverActiveSubscription(driver.id);
      if (!activeSub) {
        return res.status(403).json({
          error: "An active subscription is required to set job pickup radius.",
          code: "SUBSCRIPTION_REQUIRED",
        });
      }
      const maxMiles = await getDriverMaxRadiusMiles(driver.id);
      const radius = parseFloat(jobRadiusPreferenceMiles);
      if (isNaN(radius) || radius < 1 || radius > maxMiles) {
        return res.status(400).json({
          error: `Radius must be between 1 and ${maxMiles} miles for your plan (${activeSub.plan.deliveryRadius})`,
        });
      }
      const cappedRadius = Math.min(radius, maxMiles);
      updateData.job_radius_preference_miles = cappedRadius;
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

    updateData.updated_at = new Date();

    // Update driver preferences
    const { data: updatedDriver, error: updateError } = await drizzleAdmin
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
        error: "Database schema metadata needs refresh. Run 'NOTIFY pgrst, \"reload schema\";' in your PostgreSQL SQL tool and try again in 10 seconds.",
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
    const driverResult = await pool.query(
      `SELECT id FROM drivers WHERE user_id = $1 LIMIT 1`,
      [user.id]
    );
    const driver = driverResult.rows[0];
    if (!driver) {
      return res.status(404).json({ error: "Driver profile not found" });
    }

    const fuelTypesResult = await pool.query(
      `SELECT id, code, label, active
       FROM fuel_types
       WHERE active = true
       ORDER BY label ASC`
    );
    const fuelTypes = fuelTypesResult.rows || [];

    const pricingResult = await pool.query(
      `SELECT id, fuel_type_id, fuel_price_per_liter_cents, active, updated_at
       FROM driver_pricing
       WHERE driver_id = $1
       ORDER BY updated_at DESC`,
      [driver.id]
    );
    const driverPricingList = pricingResult.rows || [];

    // Create a map for quick lookup
    const pricingMap = new Map<string, any>();
    for (const p of driverPricingList) {
      const fuelTypeKey = p.fuel_type_id;
      if (!fuelTypeKey) continue;
      // keep the first row only because list is sorted newest first
      if (!pricingMap.has(fuelTypeKey)) pricingMap.set(fuelTypeKey, p);
    }

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
        error: "Database schema metadata needs refresh. Run 'NOTIFY pgrst, \"reload schema\";' in your PostgreSQL SQL tool and try again in 10 seconds.",
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
    const driverResult = await pool.query(
      `SELECT id FROM drivers WHERE user_id = $1 LIMIT 1`,
      [user.id]
    );
    const driver = driverResult.rows[0];
    if (!driver) {
      return res.status(404).json({ error: "Driver profile not found" });
    }

    // Validate fuel price per liter
    if (fuelPricePerLiterCents === undefined || fuelPricePerLiterCents < 0) {
      return res.status(400).json({ error: "Invalid fuel price per liter" });
    }

    const existingPricingResult = await pool.query(
      `SELECT id, fuel_price_per_liter_cents
       FROM driver_pricing
       WHERE driver_id = $1 AND fuel_type_id = $2
       ORDER BY updated_at DESC
       LIMIT 1`,
      [driver.id, fuelTypeId]
    );

    let updatedPricing;

    const existingPricing = existingPricingResult.rows[0] || null;
    if (existingPricing) {
      await pool.query(
        `UPDATE driver_pricing
         SET fuel_price_per_liter_cents = $3, updated_at = now(), active = true
         WHERE driver_id = $1 AND fuel_type_id = $2`,
        [driver.id, fuelTypeId, fuelPricePerLiterCents]
      );

      const updatedResult = await pool.query(
        `SELECT id, driver_id, fuel_type_id, fuel_price_per_liter_cents, active
         FROM driver_pricing
         WHERE driver_id = $1 AND fuel_type_id = $2
         ORDER BY updated_at DESC
         LIMIT 1`,
        [driver.id, fuelTypeId]
      );
      updatedPricing = updatedResult.rows[0] || null;

      // Add to pricing history
      await pool.query(
        `INSERT INTO pricing_history (
          entity_type, entity_id, fuel_type_id, old_price_cents, new_price_cents, changed_by, notes
        ) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        ["driver", driver.id, fuelTypeId, existingPricing.fuel_price_per_liter_cents, fuelPricePerLiterCents, user.id, notes || null]
      );
    } else {
      await pool.query(
        `INSERT INTO driver_pricing (driver_id, fuel_type_id, fuel_price_per_liter_cents, active)
         VALUES ($1,$2,$3,true)`,
        [driver.id, fuelTypeId, fuelPricePerLiterCents]
      );
      const insertedResult = await pool.query(
        `SELECT id, driver_id, fuel_type_id, fuel_price_per_liter_cents, active
         FROM driver_pricing
         WHERE driver_id = $1 AND fuel_type_id = $2
         ORDER BY updated_at DESC
         LIMIT 1`,
        [driver.id, fuelTypeId]
      );
      updatedPricing = insertedResult.rows[0] || null;

      // Add to pricing history (no old price for new entries)
      await pool.query(
        `INSERT INTO pricing_history (
          entity_type, entity_id, fuel_type_id, old_price_cents, new_price_cents, changed_by, notes
        ) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        ["driver", driver.id, fuelTypeId, null, fuelPricePerLiterCents, user.id, notes || null]
      );
    }

    res.json(updatedPricing);
  } catch (error: any) {
    
    if (error?.code === 'PGRST205' || error?.message?.includes('schema cache')) {
      return res.status(500).json({ 
        error: "Database schema metadata needs refresh. Run 'NOTIFY pgrst, \"reload schema\";' in your PostgreSQL SQL tool and try again in 10 seconds.",
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
    const { data: driver, error: driverError } = await drizzleAdmin
      .from("drivers")
      .select("id")
      .eq("user_id", user.id)
      .single();

    if (driverError) throw driverError;
    if (!driver) {
      return res.status(404).json({ error: "Driver profile not found" });
    }

    // Get pricing history
    const { data: history, error: historyError } = await drizzleAdmin
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
        error: "Database schema metadata needs refresh. Run 'NOTIFY pgrst, \"reload schema\";' in your PostgreSQL SQL tool and try again in 10 seconds.",
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
    const { data: driver, error: driverError } = await drizzleAdmin
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
      const { data: order } = await drizzleAdmin
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
      const { data: activeOrder } = await drizzleAdmin
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
    const now = new Date();
    const { error: updateError } = await drizzleAdmin
      .from("drivers")
      .update({
        currentLat: latitude,
        currentLng: longitude,
        updatedAt: now,
      })
      .eq("id", driver.id);

    if (updateError) throw updateError;

    // Also save to driver_locations table for history and real-time tracking
    // First, mark all previous locations as not current
    await drizzleAdmin
      .from("driver_locations")
      .update({ isCurrent: false })
      .eq("driver_id", driver.id)
      .eq("is_current", true);

    // Then insert the new location as current
    const { error: historyError } = await drizzleAdmin
      .from("driver_locations")
      .insert({
        driverId: driver.id,
        orderId: activeOrderId || null,
        lat: latitude,
        lng: longitude,
        isCurrent: true,
        createdAt: now,
      });

    if (historyError) {
      console.error("Error saving location history:", historyError);
    }

    // Send real-time location update via WebSocket to customer if order is active
    if (activeOrderId) {
      try {
        // Get customer user ID for this order
        const { data: order } = await drizzleAdmin
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
            timestamp: now.toISOString(),
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
      updated_at: new Date()
    };
    
    if (fullName) {
      updateData.full_name = fullName;
    }
    
    if (profilePhotoUrl) {
      updateData.profile_photo_url = profilePhotoUrl;
      console.log("Updating profile_photo_url:", profilePhotoUrl);
    }

    const { error: profileError } = await drizzleAdmin
      .from("profiles")
      .update(updateData)
      .eq("id", user.id);

    if (profileError) {
      console.error("Error updating profile:", profileError);
      throw profileError;
    }
    
    // Fetch updated profile to return the new photo URL
    const { data: updatedProfile } = await drizzleAdmin
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
    const driverResult = await pool.query(
      `SELECT id FROM drivers WHERE user_id = $1 LIMIT 1`,
      [user.id]
    );
    const driver = driverResult.rows[0];
    if (!driver) {
      return res.status(404).json({ error: "Driver profile not found" });
    }
    const docsResult = await pool.query(
      `SELECT *
       FROM documents
       WHERE owner_type = 'driver' AND owner_id = $1
       ORDER BY created_at DESC`,
      [driver.id]
    );
    res.json(docsResult.rows || []);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Upload driver document
router.post("/documents", async (req, res) => {
  const user = (req as any).user;
  const { owner_type, owner_id, doc_type, title, file_path, file_size, mime_type, expiry_date } = req.body;
  
  try {
    if (!doc_type || !file_path) {
      return res.status(400).json({ error: "doc_type and file_path are required" });
    }

    // Get driver ID
    const { data: driver, error: driverError } = await drizzleAdmin
      .from("drivers")
      .select("id")
      .eq("user_id", user.id)
      .maybeSingle();

    if (driverError) throw driverError;
    if (!driver) {
      return res.status(404).json({ error: "Driver profile not found" });
    }

    // Determine owner_type and owner_id
    let finalOwnerType: string;
    let finalOwnerId: string;

    if (owner_type && owner_id) {
      // If owner_type and owner_id are provided, validate them
      if (owner_type === "vehicle") {
        // Verify vehicle belongs to driver
        const { data: vehicle, error: vehicleError } = await drizzleAdmin
          .from("vehicles")
          .select("id, driver_id")
          .eq("id", owner_id)
          .eq("driver_id", driver.id)
          .maybeSingle();

        if (vehicleError) throw vehicleError;
        if (!vehicle) {
          return res.status(404).json({ error: "Vehicle not found or access denied" });
        }
        finalOwnerType = "vehicle";
        finalOwnerId = owner_id;
      } else if (owner_type === "driver") {
        // Verify it's the driver's own ID
        if (owner_id !== driver.id) {
          return res.status(403).json({ error: "Access denied" });
        }
        finalOwnerType = "driver";
        finalOwnerId = driver.id;
      } else {
        return res.status(400).json({ error: "Invalid owner_type. Must be 'driver' or 'vehicle'" });
      }
    } else {
      // Default to driver if not specified
      finalOwnerType = "driver";
      finalOwnerId = driver.id;
    }

    // Insert document directly via PostgreSQL so writes cannot silently no-op.
    const insertResult = await pool.query(
      `INSERT INTO documents (
        owner_type, owner_id, doc_type, title, file_path, file_size,
        mime_type, uploaded_by, expiry_date, verification_status
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
      RETURNING *`,
      [
        finalOwnerType,
        finalOwnerId,
        doc_type,
        title || doc_type,
        file_path,
        file_size || null,
        mime_type || null,
        user.id,
        expiry_date || null,
        "pending",
      ]
    );
    const document = insertResult.rows[0] || null;

    // Notify all admins about the new document upload
    if (document && (finalOwnerType === "driver" || finalOwnerType === "vehicle")) {
      try {
        const { notificationService } = await import("./notification-service");
        const { data: adminProfiles } = await drizzleAdmin
          .from("profiles")
          .select("id")
          .eq("role", "admin");
        
        if (adminProfiles && adminProfiles.length > 0) {
          const adminUserIds = adminProfiles.map(p => p.id);
          
          // Get owner name for notification
          let ownerName = "Driver";
          if (finalOwnerType === "vehicle") {
            const { data: vehicle } = await drizzleAdmin
              .from("vehicles")
              .select("registration_number")
              .eq("id", finalOwnerId)
              .single();
            ownerName = vehicle?.registration_number || "Vehicle";
          } else {
            const { data: driverProfile } = await drizzleAdmin
              .from("profiles")
              .select("full_name")
              .eq("id", user.id)
              .maybeSingle();
            ownerName = driverProfile?.full_name || "Driver";
          }
          
          await notificationService.notifyAdminDocumentUploaded(
            adminUserIds,
            document.id,
            doc_type,
            finalOwnerType,
            ownerName,
            user.id
          );

          // Check if driver was rejected - if so, reset to pending for resubmission
          if (finalOwnerType === "driver") {
            const { data: driverStatus } = await drizzleAdmin
              .from("drivers")
              .select("kyc_status, status, compliance_status")
              .eq("id", finalOwnerId)
              .single();
            
            // If driver was rejected, reset status to pending for resubmission
            if (driverStatus && (driverStatus.kyc_status === "rejected" || driverStatus.status === "rejected" || driverStatus.compliance_status === "rejected")) {
              try {
                console.log(`[KYC Resubmission] Driver ${finalOwnerId} was rejected, resetting to pending status after document upload`);
                
                // Update driver status
                const { error: driverUpdateError } = await drizzleAdmin
                  .from("drivers")
                  .update({
                    kyc_status: "pending",
                    status: "pending_compliance",
                    compliance_status: "pending",
                    compliance_rejection_reason: null,
                    updated_at: new Date()
                  })
                  .eq("id", finalOwnerId);
                
                if (driverUpdateError) {
                  console.error(`[KYC Resubmission] Error updating driver ${finalOwnerId} status:`, driverUpdateError);
                  throw driverUpdateError;
                }
                
                // Also update profile approval status
                const { error: profileUpdateError } = await drizzleAdmin
                  .from("profiles")
                  .update({ 
                    approval_status: "pending",
                    updated_at: new Date()
                  })
                  .eq("id", user.id);
                
                if (profileUpdateError) {
                  console.error(`[KYC Resubmission] Error updating profile for driver ${finalOwnerId}:`, profileUpdateError);
                  // Continue with notifications even if profile update fails
                }
                
                // Notify admins that driver has resubmitted KYC
                const { data: driverProfile, error: profileError } = await drizzleAdmin
                  .from("profiles")
                  .select("full_name")
                  .eq("id", user.id)
                  .maybeSingle();
                
                if (profileError) {
                  console.error(`[KYC Resubmission] Error fetching driver profile:`, profileError);
                }
                
                const userName = driverProfile?.full_name || "Driver";
                
                try {
                  await notificationService.notifyAdminKycSubmitted(
                    adminUserIds,
                    user.id,
                    userName,
                    "driver"
                  );
                } catch (notifyError) {
                  console.error(`[KYC Resubmission] Error notifying admins:`, notifyError);
                }
                
                // Broadcast resubmission to admins via WebSocket
                try {
                  websocketService.broadcastToRole("admin", {
                    type: "kyc_submitted",
                    payload: {
                      driverId: finalOwnerId,
                      userId: user.id,
                      type: "driver",
                      isResubmission: true
                    },
                  });
                } catch (wsError) {
                  console.error(`[KYC Resubmission] Error broadcasting WebSocket message:`, wsError);
                }
                
                // Notify driver that resubmission was received
                try {
                  await notificationService.createNotification({
                    user_id: user.id,
                    type: "account_verification_required",
                    title: "KYC Resubmission Received",
                    message: "Your KYC resubmission has been received and is under review. You will be notified once it's been reviewed.",
                    metadata: { driverId: finalOwnerId, type: "kyc_resubmission" }
                  });
                } catch (driverNotifError) {
                  console.error(`[KYC Resubmission] Error notifying driver:`, driverNotifError);
                }
              } catch (resubmissionError) {
                console.error(`[KYC Resubmission] Error in resubmission flow for driver ${finalOwnerId}:`, resubmissionError);
                // Don't fail the document upload if resubmission logic fails
              }
            } else if (driverStatus && (driverStatus.kyc_status === "pending" || driverStatus.status === "pending_compliance")) {
              // Check if this is the first document (new KYC submission)
              const { data: existingDocs } = await drizzleAdmin
                .from("documents")
                .select("id")
                .eq("owner_type", "driver")
                .eq("owner_id", finalOwnerId)
                .neq("id", document.id)
                .limit(1);
              
              // If no other documents exist, this is a new KYC submission
              if (!existingDocs || existingDocs.length === 0) {
                const { data: driverProfile } = await drizzleAdmin
                  .from("profiles")
                  .select("full_name")
                  .eq("id", user.id)
                  .maybeSingle();
                const userName = driverProfile?.full_name || "Driver";
                
                await notificationService.notifyAdminKycSubmitted(
                  adminUserIds,
                  user.id,
                  userName,
                  "driver"
                );
              }
            }
          }
        }
      } catch (notifError) {
        console.error("Error sending admin notification for document upload:", notifError);
        // Don't fail the upload if notification fails
      }
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
      return res.status(401).json({ error: "User not authenticated" });
    }

    // Import distance utilities early
    const { calculateDistance, milesToKm } = await import("./utils/distance");

    // Get driver's current location and compliance status
    // Use maybeSingle() to handle case where driver profile doesn't exist yet
    const { data: driver, error: driverError } = await drizzleAdmin
      .from("drivers")
      .select("id, current_lat, current_lng, status, compliance_status")
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
      return res.json([]);
    }

    // Check compliance status - if not approved, return empty array (can view but no depots shown)
    if (driver.status !== "active" || driver.compliance_status !== "approved") {
      return res.json([]);
    }

    // Get all depots with their pricing and supplier info
    // First try with is_active column, fallback if column doesn't exist
    let depots: any[] = [];
    let depotsError: any = null;
    
    // Try query with is_active column first
    const queryWithActive = drizzleAdmin
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
          name,
          subscription_tier
        )
      `)
      .eq("is_active", true)
      .order("name");

    const resultWithActive = await queryWithActive;
    depots = resultWithActive.data || [];
    depotsError = resultWithActive.error;

    // If error is about missing column, try without is_active filter
    if (depotsError && (depotsError.message?.includes("is_active") || depotsError.message?.includes("column") || depotsError.code === "42703" || depotsError.code === "PGRST116")) {
      console.warn("is_active column doesn't exist, fetching all depots without filter");
      const queryWithoutActive = drizzleAdmin
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
            name,
            subscription_tier
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

    // Platform listing: only depots whose supplier has active subscription/tier.
    // Use direct SQL for reliability across mixed camel/snake adapter paths.
    const supplierIds = [...new Set((activeDepots as any[]).map((d: any) => d.supplier_id).filter(Boolean))];
    let subscribedSupplierIds: Set<string> = new Set();
    if (supplierIds.length > 0) {
      const subResult = await pool.query(
        `SELECT DISTINCT s.id AS supplier_id
         FROM suppliers s
         LEFT JOIN LATERAL (
           SELECT ss.status, ss.current_period_end
           FROM supplier_subscriptions ss
           WHERE ss.supplier_id = s.id
           ORDER BY ss.updated_at DESC
           LIMIT 1
         ) latest_sub ON true
         WHERE s.id = ANY($1::uuid[])
           AND (
             s.subscription_tier IN ('standard', 'enterprise')
             OR (
               latest_sub.status = 'active'
               AND (latest_sub.current_period_end IS NULL OR latest_sub.current_period_end >= now())
             )
           )`,
        [supplierIds]
      );
      subscribedSupplierIds = new Set((subResult.rows || []).map((r: any) => r.supplier_id));
    }
    const listedDepots = (activeDepots as any[]).filter((d: any) => d.supplier_id && subscribedSupplierIds.has(d.supplier_id));

    // Sort: Enterprise suppliers first (priority), then Standard, then by name
    const tierOrder = (tier: string | null | undefined) => (tier === "enterprise" ? 0 : tier === "standard" ? 1 : 2);
    listedDepots.sort((a: any, b: any) => {
      const orderA = tierOrder(a.suppliers?.subscription_tier);
      const orderB = tierOrder(b.suppliers?.subscription_tier);
      if (orderA !== orderB) return orderA - orderB;
      return (a.name || "").localeCompare(b.name || "");
    });

    // Fetch depot prices separately because nested depots->depot_prices relations
    // are not guaranteed by the drizzle compatibility adapter.
    const listedDepotIds = listedDepots.map((d: any) => d.id).filter(Boolean);
    let pricesByDepot = new Map<string, any[]>();
    if (listedDepotIds.length > 0) {
      const { data: allDepotPrices } = await drizzleAdmin
        .from("depot_prices")
        .select(`
          id,
          depot_id,
          fuel_type_id,
          price_cents,
          min_litres,
          available_litres
        `)
        .in("depot_id", listedDepotIds)
        .order("min_litres", { ascending: true });

      const fuelTypeIds = Array.from(
        new Set(
          (allDepotPrices || [])
            .map((p: any) => p.fuel_type_id ?? p.fuelTypeId)
            .filter(Boolean)
        )
      );
      const fuelTypeMap = new Map<string, any>();
      if (fuelTypeIds.length > 0) {
        const { data: fuelRows } = await drizzleAdmin
          .from("fuel_types")
          .select("id, label, code")
          .in("id", fuelTypeIds);
        for (const fuel of fuelRows || []) {
          const fuelId = (fuel as any).id;
          if (fuelId) fuelTypeMap.set(fuelId, fuel);
        }
      }

      for (const row of allDepotPrices || []) {
        const depotId = (row as any).depot_id ?? (row as any).depotId;
        const fuelTypeId = (row as any).fuel_type_id ?? (row as any).fuelTypeId;
        if (!depotId) continue;
        if (!pricesByDepot.has(depotId)) pricesByDepot.set(depotId, []);
        pricesByDepot.get(depotId)!.push({
          ...row,
          fuel_types: fuelTypeMap.get(fuelTypeId) || null,
        });
      }
    }

    // Calculate distance for each depot if driver has location
    
    const depotsWithDistance = listedDepots.map((depot: any) => {
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
        depot_prices: pricesByDepot.get(depot.id) || [],
        distance_km: distanceKm,
        distance_miles: distanceMiles,
      };
    });

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
    // Get driver ID and compliance status
    const { data: driver, error: driverError } = await drizzleAdmin
      .from("drivers")
      .select("id, status, compliance_status")
      .eq("user_id", user.id)
      .maybeSingle();

    if (driverError) {
      console.error("Error fetching driver:", driverError);
      return res.status(500).json({ error: "Failed to fetch driver profile" });
    }

    if (!driver) {
      // Return empty array instead of error - driver might not have created profile yet
      return res.json([]);
    }

    // Check compliance status - if not approved, return empty array (can view but no orders shown)
    if (driver.status !== "active" || driver.compliance_status !== "approved") {
      // Return empty array instead of error - allows UI to load but shows no orders
      console.log(`[GET /driver/depot-orders] Driver ${driver.id} not compliant, returning empty array`);
      return res.json([]);
    }

    // Get all depot orders for this driver (without nested suppliers to avoid relationship issues)
    const { data: orders, error: ordersError } = await drizzleAdmin
      .from("driver_depot_orders")
      .select(`
        *,
        depots (
          id,
          name,
          address_street,
          address_city,
          address_province,
          address_postal_code,
          lat,
          lng,
          supplier_id
        ),
        fuel_types (
          id,
          label,
          code
        )
      `)
      .eq("driver_id", driver.id)
      .order("created_at", { ascending: false });

    if (ordersError) {
      console.error("Error fetching driver depot orders:", ordersError);
      console.error("Error details:", {
        message: ordersError.message,
        code: ordersError.code,
        details: ordersError.details,
        hint: ordersError.hint,
      });
      throw ordersError;
    }

    // Enrich orders with supplier information and driver profile separately
    if (orders && orders.length > 0) {
      // Ensure depot + fuel labels are hydrated even when nested relations are missing.
      const depotIds = Array.from(new Set((orders || []).map((o: any) => o.depot_id).filter(Boolean)));
      if (depotIds.length > 0) {
        const { data: depotRows } = await drizzleAdmin
          .from("depots")
          .select("id, name, address_street, address_city, address_province, address_postal_code, lat, lng, supplier_id")
          .in("id", depotIds);
        const depotMap = new Map((depotRows || []).map((d: any) => [d.id, d]));
        for (const order of orders) {
          const depotId = (order as any).depot_id ?? (order as any).depotId;
          if (!order.depots && depotId && depotMap.has(depotId)) {
            order.depots = depotMap.get(depotId);
          }
        }
      }

      const fuelTypeIds = Array.from(new Set((orders || []).map((o: any) => o.fuel_type_id).filter(Boolean)));
      if (fuelTypeIds.length > 0) {
        const { data: fuelRows } = await drizzleAdmin
          .from("fuel_types")
          .select("id, label, code")
          .in("id", fuelTypeIds);
        const fuelMap = new Map((fuelRows || []).map((f: any) => [f.id, f]));
        for (const order of orders) {
          const fuelTypeId = (order as any).fuel_type_id ?? (order as any).fuelTypeId;
          if (!order.fuel_types && fuelTypeId && fuelMap.has(fuelTypeId)) {
            order.fuel_types = fuelMap.get(fuelTypeId);
          }
        }
      }

      // Enrich with driver profile data
      const driverUserIds = Array.from(
        new Set(orders.map((o: any) => o.driver_id).filter(Boolean))
      );

      if (driverUserIds.length > 0) {
        // Get driver records to find user_ids
        const { data: driverRecords } = await drizzleAdmin
          .from("drivers")
          .select("id, user_id")
          .in("id", driverUserIds);

        if (driverRecords && driverRecords.length > 0) {
          const userIds = driverRecords.map((d: any) => d.user_id).filter(Boolean);
          
          if (userIds.length > 0) {
            const { data: profiles } = await drizzleAdmin
              .from("profiles")
              .select("id, full_name, phone")
              .in("id", userIds);

            const profileMap = new Map(profiles?.map(p => [p.id, p]) || []);
            const driverUserMap = new Map(driverRecords.map((d: any) => [d.id, d.user_id]));

            orders.forEach((order: any) => {
              if (order.driver_id) {
                const userId = driverUserMap.get(order.driver_id);
                if (userId && profileMap.has(userId)) {
                  if (!order.drivers) order.drivers = {};
                  order.drivers.profile = profileMap.get(userId);
                }
              }
            });
          }
        }
      }

      // Enrich with supplier information
      const supplierIds = [...new Set(
        orders
          .map((o: any) => o.depots?.supplier_id)
          .filter(Boolean)
      )];
      
      if (supplierIds.length > 0) {
        const { data: suppliers } = await drizzleAdmin
          .from("suppliers")
          .select("id, name, registered_name")
          .in("id", supplierIds);
        
        const supplierMap = new Map(
          (suppliers || []).map((s: any) => [s.id, s])
        );
        
        orders.forEach((order: any) => {
          if (order.depots?.supplier_id) {
            order.depots.suppliers = supplierMap.get(order.depots.supplier_id) || null;
          }
        });
      }
    }

    res.json(orders || []);
  } catch (error: any) {
    console.error("Error fetching driver depot orders:", error);
    console.error("Error stack:", error.stack);
    res.status(500).json({ 
      error: error.message || "Failed to fetch driver depot orders",
      details: error.details,
      code: error.code 
    });
  }
});

// Create order from depot
router.post("/depot-orders", checkDriverCompliance, requireActiveSubscription, async (req, res) => {
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
    const { data: driver, error: driverError } = await drizzleAdmin
      .from("drivers")
      .select("id")
      .eq("user_id", user.id)
      .single();

    if (driverError) throw driverError;
    if (!driver) {
      return res.status(404).json({ error: "Driver profile not found" });
    }

    // Verify depot exists and is active
    const { data: depot, error: depotError } = await drizzleAdmin
      .from("depots")
      .select("id, is_active")
      .eq("id", depotId)
      .maybeSingle();

    if (depotError || !depot) {
      return res.status(404).json({ error: "Depot not found" });
    }

    if (!depot.is_active) {
      return res.status(400).json({ error: "Depot is not active" });
    }

    // Get all pricing tiers for this fuel type at this depot
    const { data: pricingTiers, error: priceError } = await drizzleAdmin
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

    // Create the order via direct SQL so writes cannot silently no-op.
    const insertResult = await pool.query(
      `INSERT INTO driver_depot_orders (
         driver_id,
         depot_id,
         fuel_type_id,
         litres,
         price_per_litre_cents,
         total_price_cents,
         status,
         pickup_date,
         notes
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       RETURNING *`,
      [
        driver.id,
        depotId,
        fuelTypeId,
        litresNum.toString(),
        pricePerLitreCents,
        totalPriceCents,
        "pending",
        pickupDateTimestamp,
        notes || null,
      ]
    );
    const order = insertResult.rows[0] || null;
    if (!order) {
      return res.status(500).json({ error: "Failed to create depot order" });
    }

    // Notify supplier about the new order
    const supplierLookup = await pool.query(
      `SELECT d.name AS depot_name, s.owner_id AS supplier_owner_id, ft.label AS fuel_label
       FROM depots d
       JOIN suppliers s ON s.id = d.supplier_id
       LEFT JOIN fuel_types ft ON ft.id = $2
       WHERE d.id = $1
       LIMIT 1`,
      [depotId, fuelTypeId]
    );
    const supplierRow = supplierLookup.rows[0] || null;

    if (supplierRow?.supplier_owner_id) {
      const { websocketService } = await import("./websocket");
      const { notificationService } = await import("./notification-service");
      
      // Get driver profile for name
      const { data: driverProfile } = await drizzleAdmin
        .from("profiles")
        .select("full_name")
        .eq("id", user.id)
        .single();

      const driverName = driverProfile?.full_name || "Driver";
      const fuelTypeLabel = supplierRow.fuel_label || "Fuel";
      const depotName = supplierRow.depot_name || "Depot";
      const totalPrice = Number(order.total_price_cents || 0) / 100;
      const currency = "ZAR"; // You may want to get this from user profile or app settings

      // Send WebSocket update for real-time delivery
      websocketService.sendOrderUpdate(supplierRow.supplier_owner_id, {
        type: "new_driver_depot_order",
        orderId: order.id,
        depotId,
        driverId: driver.id,
      });

      // Create notification for supplier
      await notificationService.notifyDriverDepotOrderPlaced(
        supplierRow.supplier_owner_id,
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

    const createdOrderResult = await pool.query(
      `SELECT o.*, 
              json_build_object('id', d.id, 'name', d.name, 'address_city', d.address_city, 'address_province', d.address_province) AS depots,
              json_build_object('id', ft.id, 'label', ft.label, 'code', ft.code) AS fuel_types
       FROM driver_depot_orders o
       LEFT JOIN depots d ON d.id = o.depot_id
       LEFT JOIN fuel_types ft ON ft.id = o.fuel_type_id
       WHERE o.id = $1
       LIMIT 1`,
      [order.id]
    );
    res.status(201).json(createdOrderResult.rows[0] || order);
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
    const { data: driver, error: driverError } = await drizzleAdmin
      .from("drivers")
      .select("id")
      .eq("user_id", user.id)
      .single();

    if (driverError) throw driverError;
    if (!driver) {
      return res.status(404).json({ error: "Driver profile not found" });
    }

    // Check if order exists and belongs to driver
    const { data: order, error: orderError } = await drizzleAdmin
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
    const { data: updatedOrderData, error: updateError } = await drizzleAdmin
      .from("driver_depot_orders")
      .update({
        status: "cancelled",
        updated_at: new Date(),
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
      .maybeSingle();

    if (updateError) throw updateError;
    const updatedOrder = updatedOrderData || { ...order, status: "cancelled", updated_at: new Date() };

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

// ============== DRIVER DEPOT ORDER PAYMENT & SIGNATURES ==============

// Submit payment for depot order
router.post("/depot-orders/:orderId/payment", checkDriverCompliance, requireActiveSubscription, async (req, res) => {
  const user = (req as any).user;
  const { orderId } = req.params;
  const { paymentMethod, paymentProofUrl } = req.body;

  try {
    if (!paymentMethod || !["bank_transfer", "online_payment", "pay_outside_app"].includes(paymentMethod)) {
      return res.status(400).json({ error: "Valid payment method is required" });
    }

    // Get driver ID
    const { data: driver, error: driverError } = await drizzleAdmin
      .from("drivers")
      .select("id")
      .eq("user_id", user.id)
      .maybeSingle();

    if (driverError) throw driverError;
    if (!driver) {
      return res.status(404).json({ error: "Driver profile not found" });
    }

    // Get order and verify ownership
    const { data: order, error: orderError } = await drizzleAdmin
      .from("driver_depot_orders")
      .select(`
        *,
        depots (id, name, supplier_id, suppliers!inner(owner_id)),
        fuel_types (id, label)
      `)
      .eq("id", orderId)
      .eq("driver_id", driver.id)
      .maybeSingle();

    if (orderError || !order) {
      return res.status(404).json({ error: "Order not found" });
    }

    // Only allow payment if status is pending_payment
    if (order.status !== "pending_payment") {
      return res.status(400).json({ error: `Order status must be pending_payment. Current: ${order.status}` });
    }

    // For bank transfer, require proof URL
    if (paymentMethod === "bank_transfer" && !paymentProofUrl) {
      return res.status(400).json({ error: "Payment proof URL is required for bank transfer" });
    }

    // Update order with payment information
    const updateData: any = {
      payment_method: paymentMethod,
      updated_at: new Date(),
    };

    if (paymentProofUrl) {
      let normalizedPaymentProofUrl = paymentProofUrl;
      try {
        normalizedPaymentProofUrl = uploadUrlToObjectPath(paymentProofUrl);
      } catch (normalizeError) {
        console.warn("[driver depot payment] Could not normalize payment proof URL, storing raw value:", normalizeError);
      }
      updateData.payment_proof_url = normalizedPaymentProofUrl;
    }

    // Handle different payment methods
    if (paymentMethod === "online_payment") {
      // Online payment: mark as paid, go directly to ready_for_pickup (payment processed immediately)
      updateData.payment_status = "paid";
      updateData.status = "ready_for_pickup";
    } else if (paymentMethod === "bank_transfer") {
      // Bank transfer: mark as paid (payment submitted with proof), waiting for supplier verification
      updateData.payment_status = "paid";
      updateData.status = "pending_payment";
    } else if (paymentMethod === "pay_outside_app") {
      // Pay outside app: skip payment verification, go directly to ready_for_pickup
      updateData.payment_status = "not_required";
      updateData.status = "ready_for_pickup";
    }

    await pool.query(
      `UPDATE driver_depot_orders
       SET payment_method = $2,
           payment_proof_url = $3,
           payment_status = $4,
           status = $5,
           updated_at = now()
       WHERE id = $1`,
      [
        orderId,
        updateData.payment_method ?? null,
        updateData.payment_proof_url ?? null,
        updateData.payment_status ?? null,
        updateData.status ?? null,
      ]
    );

    const updatedOrderResult = await pool.query(
      `SELECT o.*,
              json_build_object('id', d.id, 'name', d.name,
                'suppliers', json_build_object('owner_id', s.owner_id)
              ) AS depots,
              json_build_object('id', ft.id, 'label', ft.label) AS fuel_types
       FROM driver_depot_orders o
       LEFT JOIN depots d ON d.id = o.depot_id
       LEFT JOIN suppliers s ON s.id = d.supplier_id
       LEFT JOIN fuel_types ft ON ft.id = o.fuel_type_id
       WHERE o.id = $1
       LIMIT 1`,
      [orderId]
    );
    const updatedOrder = updatedOrderResult.rows[0] || { ...order, ...updateData };

    // Notify supplier
    if (order.depots?.suppliers?.owner_id) {
      const { websocketService } = await import("./websocket");
      websocketService.sendOrderUpdate(order.depots.suppliers.owner_id, {
        type: "driver_depot_payment_submitted",
        orderId: updatedOrder.id,
        paymentMethod: updatedOrder.payment_method,
        paymentStatus: updatedOrder.payment_status,
      });

      // Send notification to supplier
      const { notificationService } = await import("./notification-service");
      const depotName = order.depots?.name || "Depot";
      const fuelType = order.fuel_types?.label || "fuel";
      const litres = parseFloat(order.litres || "0");
      const totalPrice = parseFloat(order.total_price_cents || "0") / 100;
      const currency = "ZAR";
      const { data: driverProfile } = await drizzleAdmin
        .from("profiles")
        .select("full_name")
        .eq("id", user.id)
        .maybeSingle();
      const driverName = driverProfile?.full_name || "Driver";
      
      await notificationService.notifySupplierPaymentReceived(
        order.depots.suppliers.owner_id,
        updatedOrder.id,
        depotName,
        fuelType,
        litres,
        totalPrice,
        currency,
        paymentMethod,
        driverName
      );
    }

    res.json(updatedOrder);
  } catch (error: any) {
    console.error("Error submitting payment:", error);
    res.status(500).json({ error: error.message });
  }
});

// Add driver signature (before fuel release)
router.post("/depot-orders/:orderId/driver-signature", checkDriverCompliance, requireActiveSubscription, async (req, res) => {
  const user = (req as any).user;
  const { orderId } = req.params;
  const signatureUrlRaw = (req.body as any)?.signatureUrl ?? (req.body as any)?.signature_url;

  try {
    if (!signatureUrlRaw) {
      return res.status(400).json({ error: "signatureUrl is required" });
    }

    let normalizedSignatureUrl: string;
    try {
      normalizedSignatureUrl = normalizeSignatureForStorage(signatureUrlRaw);
    } catch (e: any) {
      return res.status(400).json({ error: e?.message || "Invalid signature" });
    }

    // Get driver ID
    const { data: driver, error: driverError } = await drizzleAdmin
      .from("drivers")
      .select("id")
      .eq("user_id", user.id)
      .maybeSingle();

    if (driverError) throw driverError;
    if (!driver) {
      return res.status(404).json({ error: "Driver profile not found" });
    }

    const order = await fetchHydratedDriverDepotOrder(orderId, driver.id);
    if (!order) {
      return res.status(404).json({ error: "Order not found" });
    }

    const orderStatus = order.status;
    const isDeliverySignoff = orderStatus === "awaiting_signature" || orderStatus === "released";

    // Delivery / receipt signature after fuel release — complete the order (direct SQL; drizzle adapter update+select is unreliable)
    if (isDeliverySignoff) {
      const upd = await pool.query(
        `UPDATE driver_depot_orders
         SET delivery_signature_url = $1,
             delivery_signed_at = now(),
             status = 'completed',
             completed_at = now(),
             updated_at = now()
         WHERE id = $2 AND driver_id = $3`,
        [normalizedSignatureUrl, orderId, driver.id]
      );
      if (!upd.rowCount) {
        return res.status(500).json({ error: "Failed to save delivery signature" });
      }

      const updatedOrder = await fetchHydratedDriverDepotOrder(orderId, driver.id);
      if (!updatedOrder) {
        return res.status(500).json({ error: "Order updated but could not be loaded" });
      }

      if (order.depots?.suppliers?.owner_id) {
        const { websocketService } = await import("./websocket");
        websocketService.sendOrderUpdate(order.depots.suppliers.owner_id, {
          type: "driver_depot_order_completed",
          orderId: updatedOrder.id,
          status: updatedOrder.status,
        });

        const { notificationService } = await import("./notification-service");
        const depotName = order.depots?.name || "Depot";
        const fuelType = order.fuel_types?.label || "fuel";
        const litres = parseFloat(String(order.litres || "0"));
        const { data: driverProfile } = await drizzleAdmin
          .from("profiles")
          .select("full_name")
          .eq("id", user.id)
          .maybeSingle();
        const driverName = driverProfile?.full_name || "Driver";

        await notificationService.notifyDriverDepotOrderCompleted(
          user.id,
          updatedOrder.id,
          depotName,
          fuelType,
          litres
        );

        await notificationService.notifySupplierOrderCompleted(
          order.depots.suppliers.owner_id,
          updatedOrder.id,
          depotName,
          fuelType,
          litres,
          driverName
        );
      }

      return res.json(updatedOrder);
    }

    if (
      order.payment_status !== "payment_verified" &&
      order.payment_status !== "paid" &&
      order.payment_method !== "pay_outside_app"
    ) {
      return res.status(400).json({ error: "Payment must be verified before signing" });
    }

    const upd2 = await pool.query(
      `UPDATE driver_depot_orders
       SET driver_signature_url = $1,
           driver_signed_at = now(),
           updated_at = now()
       WHERE id = $2 AND driver_id = $3`,
      [normalizedSignatureUrl, orderId, driver.id]
    );
    if (!upd2.rowCount) {
      return res.status(500).json({ error: "Failed to save driver signature" });
    }

    const updatedOrder = await fetchHydratedDriverDepotOrder(orderId, driver.id);
    if (!updatedOrder) {
      return res.status(500).json({ error: "Order updated but could not be loaded" });
    }

    if (order.depots?.suppliers?.owner_id) {
      const { websocketService } = await import("./websocket");
      websocketService.sendOrderUpdate(order.depots.suppliers.owner_id, {
        type: "driver_depot_order_signed",
        orderId: updatedOrder.id,
        status: updatedOrder.status,
      });

      const { notificationService } = await import("./notification-service");
      const depotName = order.depots?.name || "Depot";
      const fuelType = order.fuel_types?.label || "fuel";
      const litres = parseFloat(String(order.litres || "0"));
      const { data: driverProfile } = await drizzleAdmin
        .from("profiles")
        .select("full_name")
        .eq("id", user.id)
        .maybeSingle();
      const driverName = driverProfile?.full_name || "Driver";

      await notificationService.notifySupplierSignatureRequired(
        order.depots.suppliers.owner_id,
        updatedOrder.id,
        depotName,
        fuelType,
        litres,
        driverName
      );
    }

    res.json(updatedOrder);
  } catch (error: any) {
    console.error("Error adding driver signature:", error);
    res.status(500).json({ error: error.message });
  }
});

// Confirm receipt (driver signs after receiving fuel)
router.post("/depot-orders/:orderId/confirm-receipt", checkDriverCompliance, requireActiveSubscription, async (req, res) => {
  const user = (req as any).user;
  const { orderId } = req.params;
  const { signatureUrl } = req.body;

  try {
    if (!signatureUrl) {
      return res.status(400).json({ error: "signatureUrl is required" });
    }

    // Get driver ID
    const { data: driver, error: driverError } = await drizzleAdmin
      .from("drivers")
      .select("id")
      .eq("user_id", user.id)
      .single();

    if (driverError) throw driverError;
    if (!driver) {
      return res.status(404).json({ error: "Driver profile not found" });
    }

    // Get order and verify ownership
    const { data: order, error: orderError } = await drizzleAdmin
      .from("driver_depot_orders")
      .select(`
        *,
        depots (id, name, suppliers!inner(owner_id)),
        fuel_types (id, label)
      `)
      .eq("id", orderId)
      .eq("driver_id", driver.id)
      .single();

    if (orderError || !order) {
      return res.status(404).json({ error: "Order not found" });
    }

    // Only confirm receipt if status is released
    if (order.status !== "released") {
      return res.status(400).json({ error: `Order must be released to confirm receipt. Current: ${order.status}` });
    }

    // Update delivery signature and mark as completed
    const { data: updatedOrder, error: updateError } = await drizzleAdmin
      .from("driver_depot_orders")
      .update({
        delivery_signature_url: signatureUrl,
        delivery_signed_at: new Date(),
        status: "completed",
        updated_at: new Date(),
      })
      .eq("id", orderId)
      .select(`
        *,
        depots (id, name, suppliers!inner(owner_id)),
        fuel_types (id, label)
      `)
      .single();

    if (updateError) throw updateError;

    // Notify supplier
    if (order.depots?.suppliers?.owner_id) {
      const { websocketService } = await import("./websocket");
      websocketService.sendOrderUpdate(order.depots.suppliers.owner_id, {
        type: "driver_depot_order_completed",
        orderId: updatedOrder.id,
        status: updatedOrder.status,
      });

      // Send notifications to driver and supplier
      const { notificationService } = await import("./notification-service");
      const depotName = order.depots?.name || "Depot";
      const fuelType = order.fuel_types?.label || "fuel";
      const litres = parseFloat(order.litres || "0");
      const { data: driverProfile } = await drizzleAdmin
        .from("profiles")
        .select("full_name")
        .eq("id", user.id)
        .maybeSingle();
      const driverName = driverProfile?.full_name || "Driver";

      // Notify driver
      await notificationService.notifyDriverDepotOrderCompleted(
        user.id,
        updatedOrder.id,
        depotName,
        fuelType,
        litres
      );

      // Notify supplier
      await notificationService.notifySupplierOrderCompleted(
        order.depots.suppliers.owner_id,
        updatedOrder.id,
        depotName,
        fuelType,
        litres,
        driverName
      );
    }

    res.json(updatedOrder);
  } catch (error: any) {
    console.error("Error confirming receipt:", error);
    res.status(500).json({ error: error.message });
  }
});

// ============== COMPLIANCE ROUTES ==============

// Get driver compliance status
router.get("/compliance/status", async (req, res) => {
  const user = (req as any).user;
  
  try {
    // Get driver ID
    const { data: driver, error: driverError } = await drizzleAdmin
      .from("drivers")
      .select("id")
      .eq("user_id", user.id)
      .maybeSingle();

    if (driverError || !driver) {
      return res.status(404).json({ error: "Driver not found" });
    }

    const complianceStatus = await getDriverComplianceStatus(driver.id);
    res.json(complianceStatus);
  } catch (error: any) {
    console.error("Error getting driver compliance status:", error);
    res.status(500).json({ error: error.message });
  }
});

// Update driver compliance information
router.put("/compliance", async (req, res) => {
  const user = (req as any).user;
  
  try {
    // Get driver ID and current id_type for proper mapping
    const { data: driver, error: driverError } = await drizzleAdmin
      .from("drivers")
      .select("id, id_type")
      .eq("user_id", user.id)
      .maybeSingle();

    if (driverError || !driver) {
      return res.status(404).json({ error: "Driver not found" });
    }

    // Extract all fields from request body
    const bodyFields = req.body;
    
    // Debug: Log incoming request body for prdp_number and company_id
    console.log("[Compliance Update] Incoming request body:", {
      prdp_number: bodyFields.prdp_number,
      company_id: bodyFields.company_id,
      prdp_number_type: typeof bodyFields.prdp_number,
      company_id_type: typeof bodyFields.company_id,
      has_prdp_number: bodyFields.hasOwnProperty('prdp_number'),
      has_company_id: bodyFields.hasOwnProperty('company_id'),
      allBodyKeys: Object.keys(bodyFields).filter(k => k.includes('prdp') || k.includes('company'))
    });
    
    // Helper function to check if a value should be included in update
    const shouldInclude = (value: any): boolean => {
      if (value === undefined) return false;
      if (value === null) return false;
      if (typeof value === 'string' && value.trim() === '') return false;
      return true;
    };

    // Helper function to validate UUID format
    const isValidUUID = (value: any): boolean => {
      if (!value || typeof value !== 'string') return false;
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      return uuidRegex.test(value.trim());
    };

    // Map frontend field names to database column names
    // Only include fields that actually exist in the drivers table
    const fieldMapping: Record<string, { dbColumn: string; type: 'string' | 'boolean' | 'date' | 'uuid' | 'number' }> = {
      // Basic profile
      driver_type: { dbColumn: 'driver_type', type: 'string' },
      // ID fields - handle id_number based on id_type
      id_type: { dbColumn: 'id_type', type: 'string' },
      id_issue_country: { dbColumn: 'id_issue_country', type: 'string' },
      // Address fields
      address_line_1: { dbColumn: 'address_line_1', type: 'string' },
      address_line_2: { dbColumn: 'address_line_2', type: 'string' },
      city: { dbColumn: 'city', type: 'string' },
      province: { dbColumn: 'province', type: 'string' },
      postal_code: { dbColumn: 'postal_code', type: 'string' },
      country: { dbColumn: 'country', type: 'string' },
      // License fields
      license_code: { dbColumn: 'license_code', type: 'string' },
      license_issue_date: { dbColumn: 'drivers_license_issue_date', type: 'date' },
      license_expiry_date: { dbColumn: 'drivers_license_expiry', type: 'date' },
      drivers_license_issue_date: { dbColumn: 'drivers_license_issue_date', type: 'date' },
      // PrDP fields
      prdp_required: { dbColumn: 'prdp_required', type: 'boolean' },
      prdp_number: { dbColumn: 'prdp_number', type: 'string' },
      prdp_category: { dbColumn: 'prdp_category', type: 'string' },
      prdp_issue_date: { dbColumn: 'prdp_issue_date', type: 'date' },
      prdp_expiry_date: { dbColumn: 'prdp_expiry', type: 'date' },
      // Dangerous Goods Training
      dg_training_required: { dbColumn: 'dg_training_required', type: 'boolean' },
      dg_training_provider: { dbColumn: 'dg_training_provider', type: 'string' },
      dg_training_certificate_number: { dbColumn: 'dg_training_certificate_number', type: 'string' },
      dg_training_issue_date: { dbColumn: 'dg_training_issue_date', type: 'date' },
      dg_training_expiry_date: { dbColumn: 'dg_training_expiry_date', type: 'date' },
      // Criminal Check
      criminal_check_done: { dbColumn: 'criminal_check_done', type: 'boolean' },
      criminal_check_reference: { dbColumn: 'criminal_check_reference', type: 'string' },
      criminal_check_date: { dbColumn: 'criminal_check_date', type: 'date' },
      // Bank fields
      bank_account_holder: { dbColumn: 'bank_account_name', type: 'string' },
      bank_name: { dbColumn: 'bank_name', type: 'string' },
      account_number: { dbColumn: 'account_number', type: 'string' },
      branch_code: { dbColumn: 'branch_code', type: 'string' },
      // Company Link
      is_company_driver: { dbColumn: 'is_company_driver', type: 'boolean' },
      company_id: { dbColumn: 'company_id', type: 'uuid' },
      role_in_company: { dbColumn: 'role_in_company', type: 'string' },
    };

    const updateData: any = {};
    
    // Handle id_number separately - map to za_id_number or passport_number based on id_type
    // Only update if we have both id_number and id_type, and id_number is not empty
    // IMPORTANT: Only update if id_type is explicitly set to avoid updating wrong column
    if (bodyFields.id_number !== undefined && shouldInclude(bodyFields.id_number)) {
      // Get id_type from request body first, then fall back to existing driver data
      const idType = bodyFields.id_type || driver?.id_type;
      
      // Only proceed if we have a valid id_type
      if (idType) {
        const idValue = typeof bodyFields.id_number === 'string' ? bodyFields.id_number.trim() : bodyFields.id_number;
        if (idValue && idValue !== '') {
          // Normalize id_type to match enum values
          const normalizedIdType = String(idType).toUpperCase();
          if (normalizedIdType === 'SA_ID' || normalizedIdType === 'SOUTH_AFRICA') {
            updateData.za_id_number = idValue;
            // Clear passport_number if switching to SA_ID
            if (driver?.passport_number) {
              updateData.passport_number = null;
            }
          } else if (normalizedIdType === 'PASSPORT') {
            updateData.passport_number = idValue;
            // Clear za_id_number if switching to Passport
            if (driver?.za_id_number) {
              updateData.za_id_number = null;
            }
          }
        }
      }
    }
    
    // Handle license_number - map to drivers_license_number
    if (bodyFields.license_number !== undefined && shouldInclude(bodyFields.license_number)) {
      updateData.drivers_license_number = typeof bodyFields.license_number === 'string' ? bodyFields.license_number.trim() : bodyFields.license_number;
    }
    
    // Collect validation errors
    const validationErrors: string[] = [];
    
    // Process each mapped field
    for (const [fieldName, mapping] of Object.entries(fieldMapping)) {
      const value = bodyFields[fieldName];
      
      // Debug logging for company_id before processing
      if (fieldName === 'company_id') {
        console.log(`[Compliance Update] Processing ${fieldName}:`, {
          value: value,
          type: typeof value,
          isNull: value === null,
          isEmptyString: value === '',
          trimmed: typeof value === 'string' ? value.trim() : 'N/A',
          isValidUUID: isValidUUID(value),
          hasOwnProperty: bodyFields.hasOwnProperty('company_id')
        });
      }
      
      if (value === undefined) {
        if (fieldName === 'company_id') {
          console.log(`[Compliance Update] ${fieldName} is undefined in request body`);
        }
        continue; // Skip if not provided
      }
      
      const dbColumn = mapping.dbColumn;
      const fieldType = mapping.type;
      
      // Debug logging for prdp_number and company_id
      if (fieldName === 'prdp_number' || fieldName === 'company_id') {
        console.log(`[Compliance Update] Processing ${fieldName}:`, {
          value,
          dbColumn,
          fieldType,
          valueType: typeof value,
          isEmpty: value === '' || value === null
        });
      }
      
      // Handle different field types
      if (fieldType === 'boolean') {
        // Booleans can be false, so include if explicitly set
        updateData[dbColumn] = Boolean(value);
      } else if (fieldType === 'uuid') {
        // UUIDs: if empty string or null, set to null; if valid UUID, use it
        if (value === null || value === '' || (typeof value === 'string' && value.trim() === '')) {
          updateData[dbColumn] = null;
          if (fieldName === 'company_id') {
            console.log(`[Compliance Update] Setting ${fieldName} (${dbColumn}) to null (empty value)`);
          }
        } else if (isValidUUID(value)) {
          updateData[dbColumn] = typeof value === 'string' ? value.trim() : value;
          if (fieldName === 'company_id') {
            console.log(`[Compliance Update] Setting ${fieldName} (${dbColumn}) to valid UUID:`, updateData[dbColumn]);
          }
        } else {
          // Invalid UUID - collect error
          if (fieldName === 'company_id') {
            console.log(`[Compliance Update] Skipping ${fieldName} (${dbColumn}) - invalid UUID:`, value, `(type: ${typeof value})`);
            console.log(`[Compliance Update] UUID validation details:`, {
              value: value,
              trimmed: typeof value === 'string' ? value.trim() : value,
              isValid: isValidUUID(value),
              uuidRegexTest: typeof value === 'string' ? /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value.trim()) : false
            });
            validationErrors.push(`Company ID must be a valid UUID format (e.g., a3d27256-cf59-447a-81c2-ce9babde91d5). The value "${value}" is not a valid UUID.`);
          }
        }
        // Skip if invalid UUID (don't update)
      } else if (fieldType === 'date') {
        // Dates: include if not empty string, convert to Date for PostgreSQL/Drizzle
        if (value !== null && value !== '' && typeof value === 'string' && value.trim() !== '') {
          const trimmedValue = value.trim();
          // If it's already in YYYY-MM-DD, convert to Date
          // Otherwise, try to parse to Date
          try {
            // Check if it's in YYYY-MM-DD format (from HTML date input)
            if (/^\d{4}-\d{2}-\d{2}$/.test(trimmedValue)) {
              updateData[dbColumn] = new Date(`${trimmedValue}T00:00:00Z`);
            } else {
              // Try to parse as date
              const date = new Date(trimmedValue);
              if (!isNaN(date.getTime())) {
                updateData[dbColumn] = date;
              } else {
                // If parsing fails, use the value as-is (might be in a different format)
                updateData[dbColumn] = trimmedValue;
              }
            }
          } catch (e) {
            // If conversion fails, use the value as-is
            console.warn(`Failed to convert date value "${trimmedValue}" for ${dbColumn}, using as-is`);
            updateData[dbColumn] = trimmedValue;
          }
        }
      } else if (fieldType === 'number') {
        // Numbers: parse and include if valid
        if (value !== null && value !== '' && value !== undefined) {
          const parsed = typeof value === 'number' ? value : parseFloat(value);
          if (!isNaN(parsed)) {
            updateData[dbColumn] = parsed;
          }
        }
      } else {
        // String fields: always include if value is provided (even empty strings to clear fields)
        if (value !== undefined) {
          // For string fields, always save the value if it's provided
          // This allows clearing fields by sending empty strings
          if (typeof value === 'string') {
            updateData[dbColumn] = value.trim();
          } else {
            updateData[dbColumn] = value;
          }
          if (fieldName === 'prdp_number' || fieldName === 'company_id') {
            console.log(`[Compliance Update] Setting ${fieldName} (${dbColumn}) to:`, updateData[dbColumn], `(type: ${typeof updateData[dbColumn]})`);
          }
        }
      }
    }

    // Handle mobile_number separately - it should be saved to profiles.phone, not drivers table
    let profileUpdateData: any = {};
    if (bodyFields.mobile_number !== undefined && shouldInclude(bodyFields.mobile_number)) {
      profileUpdateData.phone = typeof bodyFields.mobile_number === 'string' ? bodyFields.mobile_number.trim() : bodyFields.mobile_number;
      profileUpdateData.updated_at = new Date();
      
      // Update profile immediately if mobile_number was provided
      const { error: profileUpdateError } = await drizzleAdmin
        .from("profiles")
        .update(profileUpdateData)
        .eq("id", user.id);
      
      if (profileUpdateError) {
        console.error("Error updating profile phone:", profileUpdateError);
        return res.status(500).json({ 
          error: "Failed to update mobile number",
          details: profileUpdateError.message 
        });
      }
      
      console.log("Successfully updated profile phone:", profileUpdateData.phone);
    }

    // Debug: Log updateData before database update
    console.log("[Compliance Update] About to update driver with data:", {
      updateData_keys: Object.keys(updateData),
      updateData_prdp_number: updateData.prdp_number,
      updateData_company_id: updateData.company_id,
      updateData_prdp_number_type: typeof updateData.prdp_number,
      updateData_company_id_type: typeof updateData.company_id,
      updateData_full: JSON.stringify(updateData, null, 2)
    });
    
    // Only proceed if we have fields to update (either driver fields or profile fields)
    if (Object.keys(updateData).length === 0 && Object.keys(profileUpdateData).length === 0) {
      console.log("[Compliance Update] No fields to update - updateData is empty");
      return res.json({ message: "No fields to update", driver });
    }

    // Only proceed with driver update if we have fields to update
    if (Object.keys(updateData).length === 0) {
      // If we only updated profile, return success
      if (Object.keys(profileUpdateData).length > 0) {
        // Fetch updated driver and profile to return
        const { data: updatedDriver } = await drizzleAdmin
          .from("drivers")
          .select("*")
          .eq("id", driver.id)
          .single();
        
        const { data: updatedProfile } = await drizzleAdmin
          .from("profiles")
          .select("*")
          .eq("id", user.id)
          .single();
        
        // Map za_id_number/passport_number back to id_number
        const idType = updatedDriver?.id_type || null;
        let idNumber = null;
        if (idType) {
          const normalizedIdType = String(idType).toUpperCase();
          if (normalizedIdType === 'SA_ID' || normalizedIdType === 'SOUTH_AFRICA') {
            idNumber = updatedDriver?.za_id_number || null;
          } else if (normalizedIdType === 'PASSPORT') {
            idNumber = updatedDriver?.passport_number || null;
          }
        } else {
          idNumber = updatedDriver?.za_id_number || updatedDriver?.passport_number || null;
        }
        
        // Helper function to format date for HTML date input
        const formatDateForInput = (dateValue: any): string | null => {
          if (!dateValue) return null;
          try {
            // If it's already in YYYY-MM-DD format, return as-is
            if (typeof dateValue === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateValue)) {
              return dateValue;
            }
            // If it's an ISO timestamp string (e.g., "2025-12-13T00:00:00"), extract just the date part
            if (typeof dateValue === 'string' && dateValue.includes('T')) {
              const datePart = dateValue.split('T')[0];
              if (/^\d{4}-\d{2}-\d{2}$/.test(datePart)) {
                return datePart;
              }
            }
            // Otherwise, try to parse as Date
            const date = new Date(dateValue);
            if (isNaN(date.getTime())) return null;
            const year = date.getFullYear();
            const month = String(date.getMonth() + 1).padStart(2, '0');
            const day = String(date.getDate()).padStart(2, '0');
            return `${year}-${month}-${day}`;
          } catch (e) {
            return null;
          }
        };
        
        return res.json({
          ...updatedProfile,
          ...updatedDriver,
          mobile_number: updatedProfile?.phone || bodyFields.mobile_number,
          id_number: idNumber,
          license_number: updatedDriver?.drivers_license_number || null,
          license_issue_date: formatDateForInput(updatedDriver?.drivers_license_issue_date),
          license_expiry_date: formatDateForInput(updatedDriver?.drivers_license_expiry),
          prdp_number: updatedDriver?.hasOwnProperty('prdp_number') ? (updatedDriver.prdp_number || '') : null,
          prdp_issue_date: formatDateForInput(updatedDriver?.prdp_issue_date),
          prdp_expiry_date: formatDateForInput(updatedDriver?.prdp_expiry),
          dg_training_issue_date: formatDateForInput(updatedDriver?.dg_training_issue_date),
          dg_training_expiry_date: formatDateForInput(updatedDriver?.dg_training_expiry_date),
          criminal_check_date: formatDateForInput(updatedDriver?.criminal_check_date),
          company_id: updatedDriver?.hasOwnProperty('company_id') ? updatedDriver.company_id : null,
          bank_account_holder: updatedDriver?.bank_account_name || null,
          email: user.email || null
        });
      }
      return res.json({ message: "No fields to update", driver });
    }

    updateData.updated_at = new Date();

    // Check if driver was rejected - if so, reset to pending for resubmission
    if (driver.kyc_status === "rejected" || driver.status === "rejected" || driver.compliance_status === "rejected") {
      try {
        console.log(`[KYC Resubmission] Driver ${driver.id} was rejected, resetting to pending status for resubmission`);
        updateData.kyc_status = "pending";
        updateData.status = "pending_compliance";
        updateData.compliance_status = "pending";
        updateData.compliance_rejection_reason = null;
        
        // Also update profile approval status
        const { error: profileUpdateError } = await drizzleAdmin
          .from("profiles")
          .update({ 
            approval_status: "pending",
            updated_at: new Date()
          })
          .eq("id", user.id);
        
        if (profileUpdateError) {
          console.error(`[KYC Resubmission] Error updating profile for driver ${driver.id}:`, profileUpdateError);
          // Continue with driver update even if profile update fails
        }
      } catch (resubmissionError: any) {
        console.error(`[KYC Resubmission] Error resetting driver ${driver.id} status:`, resubmissionError);
        // Continue with the main update - don't fail the entire request
      }
    }

    // Debug: Log what we're about to update
    console.log("[Compliance Update] About to update driver with data:", {
      updateDataKeys: Object.keys(updateData),
      prdp_number: updateData.prdp_number,
      company_id: updateData.company_id,
      updateData: JSON.stringify(updateData, null, 2)
    });

    const { data: updatedDriver, error: updateError } = await drizzleAdmin
      .from("drivers")
      .update(updateData)
      .eq("id", driver.id)
      .select()
      .single();
    
    // Debug: Log what was returned from the update
    if (updatedDriver) {
      console.log("[Compliance Update] Driver updated successfully:", {
        prdp_number: updatedDriver.prdp_number,
        company_id: updatedDriver.company_id,
        has_prdp_number: updatedDriver.hasOwnProperty('prdp_number'),
        has_company_id: updatedDriver.hasOwnProperty('company_id')
      });
    }

    if (updateError) {
      // Check if it's a schema cache error or column not found error
      const isColumnError = updateError.message?.includes("Could not find") || 
                           updateError.message?.includes("schema cache") || 
                           updateError.code === '42703' ||
                           updateError.message?.includes("column");
      
      if (isColumnError) {
        console.error("Schema/column error:", updateError.message);
        console.error("Attempted to update fields:", Object.keys(updateData));
        
        // Try to identify which column is missing
        const missingColumnMatch = updateError.message?.match(/Could not find the '(\w+)' column/);
        const missingColumn = missingColumnMatch ? missingColumnMatch[1] : 'unknown';
        
        // Remove the problematic column and try again
        const cleanedUpdateData = { ...updateData };
        delete cleanedUpdateData[missingColumn];
        delete cleanedUpdateData.updated_at; // Remove updated_at temporarily
        
        if (Object.keys(cleanedUpdateData).length > 0) {
          cleanedUpdateData.updated_at = new Date();
          console.log(`Removed problematic column '${missingColumn}' and retrying with remaining fields...`);
          
          // Retry without the problematic column
          const retryResult = await drizzleAdmin
            .from("drivers")
            .update(cleanedUpdateData)
            .eq("id", driver.id)
            .select()
            .single();
          
          if (retryResult.error) {
            return res.status(500).json({ 
              error: `Database column '${missingColumn}' not found in drivers table.`,
              details: updateError.message,
              hint: `Please add the '${missingColumn}' column to the drivers table or refresh schema metadata by running: NOTIFY pgrst, 'reload schema'; in your PostgreSQL SQL tool.`,
              attemptedFields: Object.keys(updateData),
              skippedField: missingColumn
            });
          }
          
        // Fetch updated profile to include phone as mobile_number
        const { data: updatedProfileAfterRetry } = await drizzleAdmin
          .from("profiles")
          .select("*")
          .eq("id", user.id)
          .single();
        
        // Map za_id_number/passport_number back to id_number
        const idTypeAfterRetry = retryResult.data.id_type || null;
        let idNumberAfterRetry = null;
        if (idTypeAfterRetry) {
          const normalizedIdType = String(idTypeAfterRetry).toUpperCase();
          if (normalizedIdType === 'SA_ID' || normalizedIdType === 'SOUTH_AFRICA') {
            idNumberAfterRetry = retryResult.data.za_id_number || null;
          } else if (normalizedIdType === 'PASSPORT') {
            idNumberAfterRetry = retryResult.data.passport_number || null;
          }
        } else {
          idNumberAfterRetry = retryResult.data.za_id_number || retryResult.data.passport_number || null;
        }
        
        // Helper function to format date for HTML date input
        const formatDateForInput = (dateValue: any): string | null => {
          if (!dateValue) return null;
          try {
            // If it's already in YYYY-MM-DD format, return as-is
            if (typeof dateValue === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateValue)) {
              return dateValue;
            }
            // If it's an ISO timestamp string (e.g., "2025-12-13T00:00:00"), extract just the date part
            if (typeof dateValue === 'string' && dateValue.includes('T')) {
              const datePart = dateValue.split('T')[0];
              if (/^\d{4}-\d{2}-\d{2}$/.test(datePart)) {
                return datePart;
              }
            }
            // Otherwise, try to parse as Date
            const date = new Date(dateValue);
            if (isNaN(date.getTime())) return null;
            const year = date.getFullYear();
            const month = String(date.getMonth() + 1).padStart(2, '0');
            const day = String(date.getDate()).padStart(2, '0');
            return `${year}-${month}-${day}`;
          } catch (e) {
            return null;
          }
        };
        
        return res.json({ 
          ...updatedProfileAfterRetry,
          ...retryResult.data,
          mobile_number: updatedProfileAfterRetry?.phone || null,
          id_number: idNumberAfterRetry,
          license_number: retryResult.data.drivers_license_number || null,
          license_issue_date: formatDateForInput(retryResult.data.drivers_license_issue_date),
          license_expiry_date: formatDateForInput(retryResult.data.drivers_license_expiry),
          prdp_number: retryResult.data.prdp_number ?? null,
          prdp_issue_date: formatDateForInput(retryResult.data.prdp_issue_date),
          prdp_expiry_date: formatDateForInput(retryResult.data.prdp_expiry),
          dg_training_issue_date: formatDateForInput(retryResult.data.dg_training_issue_date),
          dg_training_expiry_date: formatDateForInput(retryResult.data.dg_training_expiry_date),
          criminal_check_date: formatDateForInput(retryResult.data.criminal_check_date),
          company_id: retryResult.data.company_id || null,
          bank_account_holder: retryResult.data.bank_account_name || null,
          email: user.email || null,
          warning: `Field '${missingColumn}' was skipped because it doesn't exist in the database.`
        });
        } else {
          return res.status(500).json({ 
            error: `Database column '${missingColumn}' not found and no other fields to update.`,
            details: updateError.message,
            hint: `Please add the '${missingColumn}' column to the drivers table or refresh the schema cache.`
          });
        }
      }
      throw updateError;
    }

    // If driver was rejected and we reset to pending, notify admins
    if (driver.kyc_status === "rejected" || driver.status === "rejected" || driver.compliance_status === "rejected") {
      try {
        const { notificationService } = await import("./notification-service");
        const { websocketService } = await import("./websocket");
        
        // Get admin user IDs
        const { data: adminProfiles } = await drizzleAdmin
          .from("profiles")
          .select("id")
          .eq("role", "admin");
        
        if (adminProfiles && adminProfiles.length > 0) {
          const adminUserIds = adminProfiles.map(p => p.id);
          
          // Get driver name
          const { data: driverProfile } = await drizzleAdmin
            .from("profiles")
            .select("full_name")
            .eq("id", user.id)
            .maybeSingle();
          const userName = driverProfile?.full_name || "Driver";
          
          // Notify admins that driver has resubmitted KYC
          await notificationService.notifyAdminKycSubmitted(
            adminUserIds,
            user.id,
            userName,
            "driver"
          );
          
          // Broadcast resubmission to admins via WebSocket
          websocketService.broadcastToRole("admin", {
            type: "kyc_submitted",
            payload: {
              driverId: driver.id,
              userId: user.id,
              type: "driver",
              isResubmission: true
            },
          });
        }
        
        // Notify driver that resubmission was received
        const { notificationService: notifService } = await import("./notification-service");
        await notifService.createNotification({
          user_id: user.id,
          type: "account_verification_required",
          title: "KYC Resubmission Received",
          message: "Your KYC resubmission has been received and is under review. You will be notified once it's been reviewed.",
          metadata: { driverId: driver.id, type: "kyc_resubmission" }
        });
      } catch (notifError) {
        console.error("Error sending notifications for KYC resubmission:", notifError);
        // Don't fail the update if notification fails
      }
    }

    // Fetch updated profile to include phone as mobile_number
    const { data: updatedProfile } = await drizzleAdmin
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .single();
    
    // Map za_id_number/passport_number back to id_number based on id_type
    const idType = updatedDriver.id_type || null;
    let idNumber = null;
    if (idType) {
      const normalizedIdType = String(idType).toUpperCase();
      if (normalizedIdType === 'SA_ID' || normalizedIdType === 'SOUTH_AFRICA') {
        idNumber = updatedDriver.za_id_number || null;
      } else if (normalizedIdType === 'PASSPORT') {
        idNumber = updatedDriver.passport_number || null;
      }
    } else {
      idNumber = updatedDriver.za_id_number || updatedDriver.passport_number || null;
    }
    
    // Helper function to format date for HTML date input
    const formatDateForInput = (dateValue: any): string | null => {
      if (!dateValue) return null;
      try {
        // If it's already in YYYY-MM-DD format, return as-is
        if (typeof dateValue === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateValue)) {
          return dateValue;
        }
        // If it's an ISO timestamp string (e.g., "2025-12-13T00:00:00"), extract just the date part
        if (typeof dateValue === 'string' && dateValue.includes('T')) {
          const datePart = dateValue.split('T')[0];
          if (/^\d{4}-\d{2}-\d{2}$/.test(datePart)) {
            return datePart;
          }
        }
        // Otherwise, try to parse as Date
        const date = new Date(dateValue);
        if (isNaN(date.getTime())) return null;
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
      } catch (e) {
        return null;
      }
    };
    
    // Return combined data with mobile_number, id_number, license, PrDP, training, criminal, company, and bank fields mapped
    res.json({
      ...updatedProfile,
      ...updatedDriver,
      mobile_number: updatedProfile?.phone || null,
      id_number: idNumber,
      license_number: updatedDriver.drivers_license_number || null,
      license_issue_date: formatDateForInput(updatedDriver.drivers_license_issue_date),
      license_expiry_date: formatDateForInput(updatedDriver.drivers_license_expiry),
      prdp_number: updatedDriver.prdp_number ?? null,
      company_id: updatedDriver.company_id ?? null,
      prdp_issue_date: formatDateForInput(updatedDriver.prdp_issue_date),
      prdp_expiry_date: formatDateForInput(updatedDriver.prdp_expiry),
      dg_training_issue_date: formatDateForInput(updatedDriver.dg_training_issue_date),
      dg_training_expiry_date: formatDateForInput(updatedDriver.dg_training_expiry_date),
      criminal_check_date: formatDateForInput(updatedDriver.criminal_check_date),
      bank_account_holder: updatedDriver.bank_account_name || null,
      email: user.email || null
    });
  } catch (error: any) {
    console.error("Error updating driver compliance:", error);
    res.status(500).json({ error: error.message });
  }
});

// Update vehicle compliance
router.post("/vehicles/:vehicleId/compliance", async (req, res) => {
  const user = (req as any).user;
  const { vehicleId } = req.params;
  
  try {
    const { data: vehicle, error: vehicleError } = await drizzleAdmin
      .from("vehicles")
      .select("driver_id")
      .eq("id", vehicleId)
      .maybeSingle();

    if (vehicleError || !vehicle?.driver_id) {
      return res.status(404).json({ error: "Vehicle not found" });
    }

    const { data: owner } = await drizzleAdmin
      .from("drivers")
      .select("user_id")
      .eq("id", vehicle.driver_id)
      .maybeSingle();

    if (!owner || owner.user_id !== user.id) {
      return res.status(403).json({ error: "Unauthorized" });
    }

    const {
      vehicle_reg_certificate_number,
      dg_vehicle_permit_required,
      dg_vehicle_permit_number,
      dg_vehicle_permit_issue_date,
      dg_vehicle_permit_expiry_date,
      vehicle_insured,
      insurance_provider,
      policy_number,
      policy_expiry_date,
      loa_required,
      loa_issue_date,
      loa_expiry_date,
      roadworthy_certificate_number,
      roadworthy_issue_date,
    } = req.body;

    const updateData: any = {};
    if (vehicle_reg_certificate_number !== undefined) updateData.vehicle_reg_certificate_number = vehicle_reg_certificate_number;
    if (dg_vehicle_permit_required !== undefined) updateData.dg_vehicle_permit_required = dg_vehicle_permit_required;
    if (dg_vehicle_permit_number !== undefined) updateData.dg_vehicle_permit_number = dg_vehicle_permit_number;
    if (dg_vehicle_permit_issue_date !== undefined) updateData.dg_vehicle_permit_issue_date = dg_vehicle_permit_issue_date;
    if (dg_vehicle_permit_expiry_date !== undefined) updateData.dg_vehicle_permit_expiry_date = dg_vehicle_permit_expiry_date;
    if (vehicle_insured !== undefined) updateData.vehicle_insured = vehicle_insured;
    if (insurance_provider !== undefined) updateData.insurance_provider = insurance_provider;
    if (policy_number !== undefined) updateData.policy_number = policy_number;
    if (policy_expiry_date !== undefined) updateData.policy_expiry_date = policy_expiry_date;
    if (loa_required !== undefined) updateData.loa_required = loa_required;
    if (loa_issue_date !== undefined) updateData.loa_issue_date = loa_issue_date;
    if (loa_expiry_date !== undefined) updateData.loa_expiry_date = loa_expiry_date;
    if (roadworthy_certificate_number !== undefined) updateData.roadworthy_certificate_number = roadworthy_certificate_number;
    if (roadworthy_issue_date !== undefined) updateData.roadworthy_issue_date = roadworthy_issue_date;

    updateData.updated_at = new Date();

    const { data: updatedVehicle, error: updateError } = await drizzleAdmin
      .from("vehicles")
      .update(updateData)
      .eq("id", vehicleId)
      .select()
      .single();

    if (updateError) {
      throw updateError;
    }

    await syncDriverVehicleCapacityLitres(vehicle.driver_id);

    res.json(updatedVehicle);
  } catch (error: any) {
    console.error("Error updating vehicle compliance:", error);
    res.status(500).json({ error: error.message });
  }
});

// Get vehicle documents
router.get("/vehicles/:vehicleId/documents", async (req, res) => {
  const user = (req as any).user;
  const { vehicleId } = req.params;
  
  try {
    // Get driver ID
    const { data: driver, error: driverError } = await drizzleAdmin
      .from("drivers")
      .select("id")
      .eq("user_id", user.id)
      .maybeSingle();

    if (driverError) throw driverError;
    if (!driver) {
      return res.status(404).json({ error: "Driver profile not found" });
    }

    // Verify vehicle belongs to driver
    const { data: vehicle, error: vehicleError } = await drizzleAdmin
      .from("vehicles")
      .select("id, driver_id")
      .eq("id", vehicleId)
      .eq("driver_id", driver.id)
      .maybeSingle();

    if (vehicleError) throw vehicleError;
    if (!vehicle) {
      return res.status(404).json({ error: "Vehicle not found or access denied" });
    }

    // Get documents for this vehicle
    const { data: documents, error: documentsError } = await drizzleAdmin
      .from("documents")
      .select("*")
      .eq("owner_type", "vehicle")
      .eq("owner_id", vehicleId)
      .order("created_at", { ascending: false });

    if (documentsError) {
      if (documentsError.message?.includes("Could not find") || 
          documentsError.message?.includes("does not exist") ||
          documentsError.message?.includes("relation") ||
          documentsError.code === "42P01" ||
          documentsError.code === "PGRST116") {
        console.warn("Documents table not found, returning empty array");
        return res.json([]);
      }
      throw documentsError;
    }

    res.json(documents || []);
  } catch (error: any) {
    console.error("Error fetching vehicle documents:", error);
    res.status(500).json({ error: error.message });
  }
});

// Get vehicle compliance status
router.get("/vehicles/:vehicleId/compliance/status", async (req, res) => {
  const user = (req as any).user;
  const { vehicleId } = req.params;
  
  try {
    const { data: vehicle, error: vehicleError } = await drizzleAdmin
      .from("vehicles")
      .select("driver_id")
      .eq("id", vehicleId)
      .maybeSingle();

    if (vehicleError || !vehicle?.driver_id) {
      return res.status(404).json({ error: "Vehicle not found" });
    }

    const { data: owner } = await drizzleAdmin
      .from("drivers")
      .select("user_id")
      .eq("id", vehicle.driver_id)
      .maybeSingle();

    if (!owner || owner.user_id !== user.id) {
      return res.status(403).json({ error: "Unauthorized" });
    }

    const complianceStatus = await getVehicleComplianceStatus(vehicleId);
    res.json(complianceStatus);
  } catch (error: any) {
    console.error("Error getting vehicle compliance status:", error);
    res.status(500).json({ error: error.message });
  }
});

// ---- Driver subscription (OZOW) ----

/** Middleware: require active subscription; return 403 SUBSCRIPTION_REQUIRED if none */
async function requireActiveSubscription(req: any, res: any, next: any) {
  try {
    const driverId = req.driverId;
    if (!driverId) return res.status(401).json({ error: "Driver not found", code: "UNAUTHORIZED" });
    const hasActive = await driverHasActiveSubscription(driverId);
    if (!hasActive) {
      return res.status(403).json({
        error: "An active subscription is required to use this feature.",
        code: "SUBSCRIPTION_REQUIRED",
        message: "Subscribe to start accepting orders and ordering from suppliers.",
      });
    }
    next();
  } catch (e: any) {
    console.error("Error checking subscription:", e);
    res.status(500).json({ error: e.message });
  }
}

// GET /api/driver/subscription – current subscription (for dashboard / subscription page)
router.get("/subscription", async (req, res) => {
  const user = (req as any).user;
  try {
    const { data: driver } = await drizzleAdmin.from("drivers").select("id").eq("user_id", user.id).maybeSingle();
    if (!driver) return res.status(404).json({ error: "Driver not found" });
    const result = await getDriverSubscription(driver.id);
    if (!result) return res.json({ subscription: null, plan: null });
    const { subscription, latestRow } = result;
    if (subscription) {
      return res.json({
        subscription: {
          id: subscription.subscriptionId,
          driverId: subscription.driverId,
          planCode: subscription.planCode,
          plan: subscription.plan,
          status: subscription.status,
          currentPeriodStart: subscription.currentPeriodStart,
          currentPeriodEnd: subscription.currentPeriodEnd,
          nextBillingAt: subscription.nextBillingAt,
        },
        hasActiveSubscription: true,
      });
    }
    const plan = latestRow ? getPlan(latestRow.plan_code) : null;
    return res.json({
      subscription: latestRow ? { id: latestRow.id, planCode: latestRow.plan_code, status: latestRow.status, nextBillingAt: latestRow.next_billing_at, currentPeriodStart: latestRow.current_period_start, currentPeriodEnd: latestRow.current_period_end, plan: plan ?? undefined } : null,
      plan: plan ?? null,
      hasActiveSubscription: false,
    });
  } catch (e: any) {
    console.error("Error fetching subscription:", e);
    res.status(500).json({ error: e.message });
  }
});

// GET /api/driver/subscription/plans – list plans for subscription page
router.get("/subscription/plans", async (_req, res) => {
  try {
    const plans = PLAN_CODES.map((code) => SUBSCRIPTION_PLANS[code]);
    const testMode = process.env.SUBSCRIPTION_TEST_MODE === "true";
    return res.json({ plans, ozowConfigured: isOzowConfigured(), testMode });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

const createPaymentSchema = z.object({ planCode: z.enum(["starter", "professional", "premium"]) });

function describeDbError(error: any) {
  if (!error) return null;
  return {
    message: error?.message || String(error),
    code: error?.code ?? null,
    detail: error?.detail ?? null,
    hint: error?.hint ?? null,
  };
}

// POST /api/driver/subscription/create-payment – create pending payment and return OZOW redirect URL (or activate immediately in test mode)
router.post("/subscription/create-payment", async (req, res) => {
  const user = (req as any).user;
  try {
    const parsed = createPaymentSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Invalid planCode", details: parsed.error.flatten() });
    const { planCode } = parsed.data as { planCode: PlanCode };
    const plan = getPlan(planCode);
    if (!plan) return res.status(400).json({ error: "Unknown plan" });

    const { data: driver } = await drizzleAdmin.from("drivers").select("id").eq("user_id", user.id).maybeSingle();
    if (!driver) return res.status(404).json({ error: "Driver not found" });

    // Test mode: activate subscription immediately without checkout redirect
    if (process.env.SUBSCRIPTION_TEST_MODE === "true") {
      const now = new Date();
      const periodStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const periodEnd = new Date(periodStart);
      periodEnd.setMonth(periodEnd.getMonth() + 1);
      const nextBilling = new Date(periodEnd);

      const { data: existingSub } = await drizzleAdmin
        .from("driver_subscriptions")
        .select("id")
        .eq("driver_id", driver.id)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      let subscriptionId: string;
      if (existingSub) {
        await drizzleAdmin
          .from("driver_subscriptions")
          .update({
            planCode: planCode,
            status: "active",
            amountCents: plan.priceCents,
            currency: "ZAR",
            currentPeriodStart: periodStart,
            currentPeriodEnd: periodEnd,
            nextBillingAt: nextBilling,
            updatedAt: now,
          })
          .eq("id", existingSub.id);
        subscriptionId = existingSub.id;
      } else {
        const { data: newSub, error: insertErr } = await drizzleAdmin
          .from("driver_subscriptions")
          .insert({
            driverId: driver.id,
            planCode: planCode,
            status: "active",
            amountCents: plan.priceCents,
            currency: "ZAR",
            currentPeriodStart: periodStart,
            currentPeriodEnd: periodEnd,
            nextBillingAt: nextBilling,
          })
          .single();
        if (insertErr || !newSub) {
          const err = describeDbError(insertErr);
          console.error("[subscription/create-payment] create subscription failed:", err);
          return res.status(500).json({
            error: "Failed to create subscription",
            ...(process.env.NODE_ENV === "development" ? { db: err } : {}),
          });
        }
        subscriptionId = newSub.id;
      }

      await drizzleAdmin
        .from("subscription_payments")
        .insert({
          driverSubscriptionId: subscriptionId,
          amountCents: plan.priceCents,
          currency: "ZAR",
          status: "completed",
          paidAt: now,
        });

      await drizzleAdmin
        .from("drivers")
        .update({
          premiumStatus: "active",
          subscriptionTier: planCode,
          updatedAt: now,
        })
        .eq("id", driver.id);

      return res.json({ success: true });
    }

    if (!isOzowConfigured()) return res.status(503).json({ error: "Payment gateway not configured", code: "OZOW_NOT_CONFIGURED" });

    const baseUrl = process.env.PUBLIC_APP_URL || (req.protocol + "://" + req.get("host") || "http://localhost:5000");
    const successUrl = `${baseUrl}/driver/subscription?success=true`;
    const cancelUrl = `${baseUrl}/driver/subscription?cancelled=true`;
    const notificationUrl = `${baseUrl}/api/webhooks/ozow-subscription`;

    // Upsert driver_subscriptions row (one per driver; status pending until webhook)
    const { data: existingSub } = await drizzleAdmin
      .from("driver_subscriptions")
      .select("id")
      .eq("driver_id", driver.id)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    let subscriptionId: string;
    if (existingSub) {
      await drizzleAdmin
        .from("driver_subscriptions")
        .update({ planCode: planCode, status: "pending", amountCents: plan.priceCents, currency: "ZAR", updatedAt: new Date() })
        .eq("id", existingSub.id);
      subscriptionId = existingSub.id;
    } else {
      const { data: newSub, error: insertErr } = await drizzleAdmin
        .from("driver_subscriptions")
        .insert({ driverId: driver.id, planCode: planCode, status: "pending", amountCents: plan.priceCents, currency: "ZAR" })
        .single();
      if (insertErr || !newSub) {
        const err = describeDbError(insertErr);
        console.error("[subscription/create-payment] create pending subscription failed:", err);
        return res.status(500).json({
          error: "Failed to create subscription",
          ...(process.env.NODE_ENV === "development" ? { db: err } : {}),
        });
      }
      subscriptionId = newSub.id;
    }

    // Create subscription_payments row (pending)
    const { data: paymentRow, error: payErr } = await drizzleAdmin
      .from("subscription_payments")
      .insert({
        driverSubscriptionId: subscriptionId,
        amountCents: plan.priceCents,
        currency: "ZAR",
        status: "pending",
      })
      .single();
    if (payErr || !paymentRow) {
      const err = describeDbError(payErr);
      console.error("[subscription/create-payment] create payment record failed:", err);
      return res.status(500).json({
        error: "Failed to create payment record",
        ...(process.env.NODE_ENV === "development" ? { db: err } : {}),
      });
    }

    const transactionReference = `sub_${paymentRow.id}`;
    const redirectUrl = buildPaymentRedirectUrl({
      amountRands: plan.priceZAR,
      transactionReference,
      successUrl,
      cancelUrl,
      notificationUrl,
      customerEmail: user.email ?? undefined,
      customerName: (user.user_metadata?.full_name as string) || (req.body?.customerName as string) || undefined,
    });

    return res.json({ redirectUrl, paymentId: paymentRow.id, subscriptionId });
  } catch (e: any) {
    const err = describeDbError(e);
    console.error("[subscription/create-payment] unexpected failure:", err);
    res.status(500).json({
      error: err?.message || "Failed to create payment",
      ...(process.env.NODE_ENV === "development" ? { db: err } : {}),
    });
  }
});

// POST /api/driver/subscription/cancel – cancel at period end (optional)
router.post("/subscription/cancel", async (req, res) => {
  const user = (req as any).user;
  try {
    const { data: driver } = await drizzleAdmin.from("drivers").select("id").eq("user_id", user.id).maybeSingle();
    if (!driver) return res.status(404).json({ error: "Driver not found" });
    const { error } = await drizzleAdmin
      .from("driver_subscriptions")
      .update({ status: "cancelled", updated_at: new Date() })
      .eq("driver_id", driver.id)
      .eq("status", "active");
    if (error) return res.status(500).json({ error: error.message });
    await drizzleAdmin.from("drivers").update({ premium_status: "inactive", subscription_tier: null }).eq("id", driver.id);
    return res.json({ ok: true, message: "Subscription cancelled at period end." });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/driver/company-membership — current fleet company link (if any)
router.get("/company-membership", async (req, res) => {
  const user = (req as any).user;
  try {
    const { data: driver, error: dErr } = await drizzleAdmin
      .from("drivers")
      .select("id")
      .eq("user_id", user.id)
      .maybeSingle();
    if (dErr) return res.status(500).json({ error: dErr.message });
    if (!driver) return res.status(404).json({ error: "Driver not found" });

    const { data: row, error: mErr } = await drizzleAdmin
      .from("driver_company_memberships")
      .select("company_id, is_disabled_by_company, disabled_reason, updated_at")
      .eq("driver_id", driver.id)
      .maybeSingle();
    if (mErr) return res.status(500).json({ error: mErr.message });

    if (!row || !row.company_id) {
      return res.json({
        mode: "independent" as const,
        companyId: null,
        companyName: null,
        isDisabledByCompany: false,
        disabledReason: null,
        updatedAt: row?.updated_at ?? null,
      });
    }

    const { data: comp } = await drizzleAdmin
      .from("companies")
      .select("id, name")
      .eq("id", row.company_id)
      .maybeSingle();

    return res.json({
      mode: "company" as const,
      companyId: row.company_id,
      companyName: comp?.name ?? null,
      isDisabledByCompany: row.is_disabled_by_company,
      disabledReason: row.disabled_reason,
      updatedAt: row.updated_at,
    });
  } catch (e: any) {
    console.error("GET /driver/company-membership:", e);
    res.status(500).json({ error: e.message });
  }
});

const companyMembershipPutSchema = z.object({
  companyId: z.string().uuid().nullable(),
});

// PUT /api/driver/company-membership — work independently or under one company
router.put("/company-membership", async (req, res) => {
  const user = (req as any).user;
  const parsed = companyMembershipPutSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid body", details: parsed.error.flatten() });
  }

  try {
    const { data: driver, error: dErr } = await drizzleAdmin
      .from("drivers")
      .select("id")
      .eq("user_id", user.id)
      .maybeSingle();
    if (dErr) return res.status(500).json({ error: dErr.message });
    if (!driver) return res.status(404).json({ error: "Driver not found" });

    const { companyId } = parsed.data;
    const now = new Date();

    if (companyId === null) {
      const { error: upErr } = await drizzleAdmin.from("driver_company_memberships").upsert(
        {
          driver_id: driver.id,
          company_id: null,
          is_disabled_by_company: false,
          disabled_reason: null,
          updated_at: now,
        },
        { onConflict: "driver_id" }
      );
      if (upErr) return res.status(500).json({ error: upErr.message });
      return res.json({ ok: true, mode: "independent" });
    }

    const { data: comp, error: cErr } = await drizzleAdmin
      .from("companies")
      .select("id, status")
      .eq("id", companyId)
      .maybeSingle();
    if (cErr) return res.status(500).json({ error: cErr.message });
    if (!comp || comp.status !== "active") {
      return res.status(400).json({ error: "Company not found or not active" });
    }

    const { error: upErr } = await drizzleAdmin.from("driver_company_memberships").upsert(
      {
        driver_id: driver.id,
        company_id: companyId,
        is_disabled_by_company: false,
        disabled_reason: null,
        updated_at: now,
      },
      { onConflict: "driver_id" }
    );
    if (upErr) return res.status(500).json({ error: upErr.message });
    return res.json({ ok: true, mode: "company", companyId });
  } catch (e: any) {
    console.error("PUT /driver/company-membership:", e);
    res.status(500).json({ error: e.message });
  }
});

export default router;

