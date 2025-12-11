import { Router } from "express";
import { supabaseAdmin } from "./supabase";
import { sendDriverAcceptanceEmail, sendDeliveryCompletionEmail } from "./email-service";
import { insertDriverPricingSchema, insertPricingHistorySchema } from "@shared/schema";
import { websocketService } from "./websocket";
import { pushNotificationService } from "./push-service";
import { cleanupChatForOrder, ensureChatThreadForAssignment } from "./chat-service";
import { offerNotifications, orderNotifications } from "./notification-helpers";
import { getDriverComplianceStatus, getVehicleComplianceStatus, canDriverAccessPlatform } from "./compliance-service";
import { z } from "zod";
import dotenv from "dotenv";
dotenv.config();

const router = Router();

// Helper middleware to check driver compliance
async function checkDriverCompliance(req: any, res: any, next: any) {
  try {
    const user = req.user;
    const { data: driver } = await supabaseAdmin
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
    
    // Debug: Log prdp_number and company_id to verify they're being fetched
    if (driver) {
      console.log("[Driver Profile API] Driver data fetched:", {
        driverId: driver.id,
        prdp_number: driver.prdp_number,
        company_id: driver.company_id,
        prdp_number_type: typeof driver.prdp_number,
        company_id_type: typeof driver.company_id,
        prdp_number_value: JSON.stringify(driver.prdp_number),
        company_id_value: JSON.stringify(driver.company_id),
        allKeys: Object.keys(driver).filter(k => k.includes('prdp') || k.includes('company'))
      });
    }

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
    
    // Debug: Check what's in cleanedDriver before creating response
    console.log("[Driver Profile API] Before response creation:", {
      cleanedDriver_prdp_number: cleanedDriver.prdp_number,
      cleanedDriver_company_id: cleanedDriver.company_id,
      driver_prdp_number: driver.prdp_number,
      driver_company_id: driver.company_id
    });
    
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
    
    // Debug: Check what's in the final response
    console.log("[Driver Profile API] Final response includes:", {
      response_prdp_number: response.prdp_number,
      response_company_id: response.company_id,
      response_prdp_number_type: typeof response.prdp_number,
      response_company_id_type: typeof response.company_id
    });
    
    // Debug: Log status fields to verify they're correct
    console.log("[Driver Profile API] Returning driver profile:", {
      userId: user.id,
      driverId: driver.id,
      status: driver.status,
      compliance_status: driver.compliance_status,
      kyc_status: driver.kyc_status,
      mobile_number: profile.phone,
      id_type: idType,
      id_number: idNumber,
      za_id_number: driver.za_id_number,
      passport_number: driver.passport_number
    });
    
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
    vehicleStatus: vehicle.vehicle_status, // Include vehicle_status for compliance status
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
// Note: This route is accessible without compliance approval - will return empty array if not compliant
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
    
    // If no driver record, return empty array (driver hasn't completed setup)
    if (!driver) {
      return res.json([]);
    }

    // Check if driver is compliant - if not, return empty array (no orders will be assigned)
    const { data: driverStatus } = await supabaseAdmin
      .from("drivers")
      .select("status, compliance_status")
      .eq("id", driver.id)
      .single();
    
    if (!driverStatus || driverStatus.status !== "active" || driverStatus.compliance_status !== "approved") {
      return res.json([]);
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
// Note: This route is accessible without compliance approval - will return empty array if not compliant
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
    
    // If no driver record, return empty array (driver hasn't completed setup)
    if (!driver) {
      return res.json([]);
    }

    // Check if driver is compliant - if not, return empty array (no orders will be completed)
    const { data: driverStatus } = await supabaseAdmin
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
router.post("/orders/:orderId/start", checkDriverCompliance, async (req, res) => {
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
router.post("/orders/:orderId/pickup", checkDriverCompliance, async (req, res) => {
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
router.post("/orders/:orderId/complete", checkDriverCompliance, async (req, res) => {
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
  const { owner_type, owner_id, doc_type, title, file_path, file_size, mime_type, expiry_date } = req.body;
  
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

    // Determine owner_type and owner_id
    let finalOwnerType: string;
    let finalOwnerId: string;

    if (owner_type && owner_id) {
      // If owner_type and owner_id are provided, validate them
      if (owner_type === "vehicle") {
        // Verify vehicle belongs to driver
        const { data: vehicle, error: vehicleError } = await supabaseAdmin
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

    // Insert document
    const { data: document, error: insertError } = await supabaseAdmin
      .from("documents")
      .insert({
        owner_type: finalOwnerType,
        owner_id: finalOwnerId,
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

    // Notify all admins about the new document upload
    if (document && (finalOwnerType === "driver" || finalOwnerType === "vehicle")) {
      try {
        const { notificationService } = await import("./notification-service");
        const { data: adminProfiles } = await supabaseAdmin
          .from("profiles")
          .select("id")
          .eq("role", "admin");
        
        if (adminProfiles && adminProfiles.length > 0) {
          const adminUserIds = adminProfiles.map(p => p.id);
          
          // Get owner name for notification
          let ownerName = "Driver";
          if (finalOwnerType === "vehicle") {
            const { data: vehicle } = await supabaseAdmin
              .from("vehicles")
              .select("registration_number")
              .eq("id", finalOwnerId)
              .single();
            ownerName = vehicle?.registration_number || "Vehicle";
          } else {
            const { data: driverProfile } = await supabaseAdmin
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
            ownerName
          );

          // Check if this is a new KYC submission (driver status is pending)
          if (finalOwnerType === "driver") {
            const { data: driverStatus } = await supabaseAdmin
              .from("drivers")
              .select("kyc_status, status")
              .eq("id", finalOwnerId)
              .single();
            
            if (driverStatus && (driverStatus.kyc_status === "pending" || driverStatus.status === "pending_compliance")) {
              // Check if this is the first document (new KYC submission)
              const { data: existingDocs } = await supabaseAdmin
                .from("documents")
                .select("id")
                .eq("owner_type", "driver")
                .eq("owner_id", finalOwnerId)
                .neq("id", document.id)
                .limit(1);
              
              // If no other documents exist, this is a new KYC submission
              if (!existingDocs || existingDocs.length === 0) {
                const { data: driverProfile } = await supabaseAdmin
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
      console.error("GET /driver/depots: User not authenticated", { hasUser: !!user, userId: user?.id });
      return res.status(401).json({ error: "User not authenticated" });
    }

    // Import distance utilities early
    const { calculateDistance, milesToKm } = await import("./utils/distance");

    // Get driver's current location and compliance status
    // Use maybeSingle() to handle case where driver profile doesn't exist yet
    const { data: driver, error: driverError } = await supabaseAdmin
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
      // Return empty array instead of error - driver might not have created profile yet
      console.warn(`[GET /driver/depots] Driver profile not found for user ${user.id}`);
      return res.json([]);
    }

    // Check compliance status - if not approved, return empty array (can view but no depots shown)
    if (driver.status !== "active" || driver.compliance_status !== "approved") {
      // Return empty array instead of error - allows UI to load but shows no depots
      console.log(`[GET /driver/depots] Driver ${driver.id} not compliant, returning empty array`);
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
    // Get driver ID and compliance status
    const { data: driver, error: driverError } = await supabaseAdmin
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
    const { data: orders, error: ordersError } = await supabaseAdmin
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
      // Enrich with driver profile data
      const driverUserIds = Array.from(
        new Set(orders.map((o: any) => o.driver_id).filter(Boolean))
      );

      if (driverUserIds.length > 0) {
        // Get driver records to find user_ids
        const { data: driverRecords } = await supabaseAdmin
          .from("drivers")
          .select("id, user_id")
          .in("id", driverUserIds);

        if (driverRecords && driverRecords.length > 0) {
          const userIds = driverRecords.map((d: any) => d.user_id).filter(Boolean);
          
          if (userIds.length > 0) {
            const { data: profiles } = await supabaseAdmin
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
        const { data: suppliers } = await supabaseAdmin
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
router.post("/depot-orders", checkDriverCompliance, async (req, res) => {
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

// ============== DRIVER DEPOT ORDER PAYMENT & SIGNATURES ==============

// Submit payment for depot order
router.post("/depot-orders/:orderId/payment", checkDriverCompliance, async (req, res) => {
  const user = (req as any).user;
  const { orderId } = req.params;
  const { paymentMethod, paymentProofUrl } = req.body;

  try {
    if (!paymentMethod || !["bank_transfer", "online_payment", "pay_outside_app"].includes(paymentMethod)) {
      return res.status(400).json({ error: "Valid payment method is required" });
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

    // Get order and verify ownership
    const { data: order, error: orderError } = await supabaseAdmin
      .from("driver_depot_orders")
      .select(`
        *,
        depots (id, name, supplier_id, suppliers!inner(owner_id)),
        fuel_types (id, label)
      `)
      .eq("id", orderId)
      .eq("driver_id", driver.id)
      .single();

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
      updated_at: new Date().toISOString(),
    };

    if (paymentProofUrl) {
      updateData.payment_proof_url = paymentProofUrl;
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

    const { data: updatedOrder, error: updateError } = await supabaseAdmin
      .from("driver_depot_orders")
      .update(updateData)
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
      const { data: driverProfile } = await supabaseAdmin
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
router.post("/depot-orders/:orderId/driver-signature", checkDriverCompliance, async (req, res) => {
  const user = (req as any).user;
  const { orderId } = req.params;
  const { signatureUrl } = req.body;

  try {
    if (!signatureUrl) {
      return res.status(400).json({ error: "signatureUrl is required" });
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

    // Get order and verify ownership
    const { data: order, error: orderError } = await supabaseAdmin
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

    // Check if order is awaiting signature - if so, this is the delivery signature and should complete the order
    if (order.status === "awaiting_signature") {
      // This is a delivery signature after fuel release - complete the order
      const { data: updatedOrder, error: updateError } = await supabaseAdmin
        .from("driver_depot_orders")
        .update({
          delivery_signature_url: signatureUrl,
          delivery_signed_at: new Date().toISOString(),
          status: "completed",
          completed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
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
        const { data: driverProfile } = await supabaseAdmin
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

      return res.json(updatedOrder);
    }

    // For other statuses, check if payment is verified/paid
    if (order.payment_status !== "payment_verified" && order.payment_status !== "paid" && order.payment_method !== "pay_outside_app") {
      return res.status(400).json({ error: "Payment must be verified before signing" });
    }

    // This should not happen in the new flow, but keep for backward compatibility
    // Update driver signature (old flow - before pickup)
    const { data: updatedOrder, error: updateError } = await supabaseAdmin
      .from("driver_depot_orders")
      .update({
        driver_signature_url: signatureUrl,
        driver_signed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
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
        type: "driver_depot_order_signed",
        orderId: updatedOrder.id,
        status: updatedOrder.status,
      });

      // Send notification to supplier that driver signature is required
      const { notificationService } = await import("./notification-service");
      const depotName = order.depots?.name || "Depot";
      const fuelType = order.fuel_types?.label || "fuel";
      const litres = parseFloat(order.litres || "0");
      const { data: driverProfile } = await supabaseAdmin
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
router.post("/depot-orders/:orderId/confirm-receipt", checkDriverCompliance, async (req, res) => {
  const user = (req as any).user;
  const { orderId } = req.params;
  const { signatureUrl } = req.body;

  try {
    if (!signatureUrl) {
      return res.status(400).json({ error: "signatureUrl is required" });
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

    // Get order and verify ownership
    const { data: order, error: orderError } = await supabaseAdmin
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
    const { data: updatedOrder, error: updateError } = await supabaseAdmin
      .from("driver_depot_orders")
      .update({
        delivery_signature_url: signatureUrl,
        delivery_signed_at: new Date().toISOString(),
        status: "completed",
        updated_at: new Date().toISOString(),
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
      const { data: driverProfile } = await supabaseAdmin
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
    const { data: driver, error: driverError } = await supabaseAdmin
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
    const { data: driver, error: driverError } = await supabaseAdmin
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
        // Dates: include if not empty string, convert to ISO format for PostgreSQL
        if (value !== null && value !== '' && typeof value === 'string' && value.trim() !== '') {
          const trimmedValue = value.trim();
          // If it's already in ISO format (YYYY-MM-DD or full ISO), use it
          // Otherwise, try to parse and convert to ISO
          try {
            // Check if it's in YYYY-MM-DD format (from HTML date input)
            if (/^\d{4}-\d{2}-\d{2}$/.test(trimmedValue)) {
              // HTML date input gives YYYY-MM-DD, convert to ISO timestamp
              updateData[dbColumn] = new Date(trimmedValue + 'T00:00:00Z').toISOString();
            } else {
              // Try to parse as date and convert to ISO
              const date = new Date(trimmedValue);
              if (!isNaN(date.getTime())) {
                updateData[dbColumn] = date.toISOString();
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
      profileUpdateData.updated_at = new Date().toISOString();
      
      // Update profile immediately if mobile_number was provided
      const { error: profileUpdateError } = await supabaseAdmin
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
        const { data: updatedDriver } = await supabaseAdmin
          .from("drivers")
          .select("*")
          .eq("id", driver.id)
          .single();
        
        const { data: updatedProfile } = await supabaseAdmin
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

    updateData.updated_at = new Date().toISOString();

    // Debug: Log what we're about to update
    console.log("[Compliance Update] About to update driver with data:", {
      updateDataKeys: Object.keys(updateData),
      prdp_number: updateData.prdp_number,
      company_id: updateData.company_id,
      updateData: JSON.stringify(updateData, null, 2)
    });

    const { data: updatedDriver, error: updateError } = await supabaseAdmin
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
          cleanedUpdateData.updated_at = new Date().toISOString();
          console.log(`Removed problematic column '${missingColumn}' and retrying with remaining fields...`);
          
          // Retry without the problematic column
          const retryResult = await supabaseAdmin
            .from("drivers")
            .update(cleanedUpdateData)
            .eq("id", driver.id)
            .select()
            .single();
          
          if (retryResult.error) {
            return res.status(500).json({ 
              error: `Database column '${missingColumn}' not found in drivers table.`,
              details: updateError.message,
              hint: `Please add the '${missingColumn}' column to the drivers table or refresh the schema cache by running: NOTIFY pgrst, 'reload schema'; in Supabase SQL Editor.`,
              attemptedFields: Object.keys(updateData),
              skippedField: missingColumn
            });
          }
          
        // Fetch updated profile to include phone as mobile_number
        const { data: updatedProfileAfterRetry } = await supabaseAdmin
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

    // Fetch updated profile to include phone as mobile_number
    const { data: updatedProfile } = await supabaseAdmin
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
    // Verify vehicle belongs to driver
    const { data: vehicle, error: vehicleError } = await supabaseAdmin
      .from("vehicles")
      .select("driver_id, drivers!inner(user_id)")
      .eq("id", vehicleId)
      .single();

    if (vehicleError || !vehicle) {
      return res.status(404).json({ error: "Vehicle not found" });
    }

    // Verify ownership
    const { data: driver } = await supabaseAdmin
      .from("drivers")
      .select("user_id")
      .eq("id", vehicle.driver_id)
      .single();

    if (!driver || driver.user_id !== user.id) {
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

    updateData.updated_at = new Date().toISOString();

    const { data: updatedVehicle, error: updateError } = await supabaseAdmin
      .from("vehicles")
      .update(updateData)
      .eq("id", vehicleId)
      .select()
      .single();

    if (updateError) {
      throw updateError;
    }

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
    const { data: driver, error: driverError } = await supabaseAdmin
      .from("drivers")
      .select("id")
      .eq("user_id", user.id)
      .maybeSingle();

    if (driverError) throw driverError;
    if (!driver) {
      return res.status(404).json({ error: "Driver profile not found" });
    }

    // Verify vehicle belongs to driver
    const { data: vehicle, error: vehicleError } = await supabaseAdmin
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
    const { data: documents, error: documentsError } = await supabaseAdmin
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
    // Verify vehicle belongs to driver
    const { data: vehicle, error: vehicleError } = await supabaseAdmin
      .from("vehicles")
      .select("driver_id, drivers!inner(user_id)")
      .eq("id", vehicleId)
      .single();

    if (vehicleError || !vehicle) {
      return res.status(404).json({ error: "Vehicle not found" });
    }

    // Verify ownership
    const { data: driver } = await supabaseAdmin
      .from("drivers")
      .select("user_id")
      .eq("id", vehicle.driver_id)
      .single();

    if (!driver || driver.user_id !== user.id) {
      return res.status(403).json({ error: "Unauthorized" });
    }

    const complianceStatus = await getVehicleComplianceStatus(vehicleId);
    res.json(complianceStatus);
  } catch (error: any) {
    console.error("Error getting vehicle compliance status:", error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
