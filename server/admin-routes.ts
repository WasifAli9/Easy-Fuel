import { Router } from "express";
import { supabaseAdmin } from "./supabase";
import { ObjectStorageService } from "./objectStorage";
import { getDriverComplianceStatus, getSupplierComplianceStatus } from "./compliance-service";
import { websocketService } from "./websocket";

const router = Router();
const objectStorageService = new ObjectStorageService();

// Get all users with their profiles and role-specific data
router.get("/users", async (req, res) => {
  try {
    // Fetch all profiles with joined data
    const { data: profilesData, error: profilesError } = await supabaseAdmin
      .from("profiles")
      .select("*")
      .order("created_at", { ascending: false });

    if (profilesError) throw profilesError;

    // Fetch auth users for email
    const { data: { users }, error: authError } = await supabaseAdmin.auth.admin.listUsers();
    if (authError) throw authError;

    // Fetch drivers
    const { data: driversData } = await supabaseAdmin.from("drivers").select("*");
    
    // Fetch suppliers
    const { data: suppliersData } = await supabaseAdmin.from("suppliers").select("*");
    
    // Fetch customers
    const { data: customersData } = await supabaseAdmin.from("customers").select("*");

    // Combine data
    const usersWithDetails = profilesData?.map(profile => {
      const authUser = users.find(u => u.id === profile.id);
      const driver = driversData?.find(d => d.user_id === profile.id);
      const supplier = suppliersData?.find(s => s.owner_id === profile.id);
      const customer = customersData?.find(c => c.user_id === profile.id);

      return {
        id: profile.id,
        email: authUser?.email,
        role: profile.role,
        full_name: profile.full_name,
        phone: profile.phone,
        created_at: profile.created_at,
        driver: driver || null,
        supplier: supplier || null,
        customer: customer || null,
      };
    });

    res.json(usersWithDetails || []);
  } catch (error: any) {
    console.error("Error fetching users:", error);
    res.status(500).json({ error: error.message });
  }
});

// Get all customers
router.get("/customers", async (req, res) => {
  try {
    const { data: customers, error } = await supabaseAdmin
      .from("customers")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) throw error;

    // Fetch profiles and emails for customers
    const customersWithProfiles = await Promise.all(
      (customers || []).map(async (customer) => {
        // Try to fetch profile with profile_photo_url, fallback to without if column doesn't exist
        let profile = null;
        const { data, error } = await supabaseAdmin
          .from("profiles")
          .select("id, full_name, phone, role, profile_photo_url")
          .eq("id", customer.user_id)
          .single();
        
        if (error) {
          // If profile_photo_url column doesn't exist, fetch without it
          if (error.code === '42703') {
            const { data: profileData } = await supabaseAdmin
              .from("profiles")
              .select("id, full_name, phone, role")
              .eq("id", customer.user_id)
              .single();
            profile = profileData;
          } else {
            console.error(`Failed to fetch profile for customer ${customer.user_id}:`, error);
          }
        } else {
          profile = data;
        }
        
        // Fetch email from Supabase Auth
        let email = null;
        try {
          const { data: authData } = await supabaseAdmin.auth.admin.getUserById(customer.user_id);
          email = authData?.user?.email || null;
        } catch (e) {
          console.error(`Failed to fetch email for customer ${customer.user_id}:`, e);
        }
        
        return {
          ...customer,
          profiles: profile ? { ...profile, email } : null,
        };
      })
    );

    res.json(customersWithProfiles);
  } catch (error: any) {
    console.error("Error fetching customers:", error);
    res.status(500).json({ error: error.message });
  }
});

// Get all suppliers
router.get("/suppliers", async (req, res) => {
  try {
    const { data: suppliers, error } = await supabaseAdmin
      .from("suppliers")
      .select("*");

    if (error) throw error;

    // Fetch profiles and emails for suppliers
    const suppliersWithProfiles = await Promise.all(
      (suppliers || []).map(async (supplier) => {
        // Try to fetch profile with profile_photo_url, fallback to without if column doesn't exist
        let profile = null;
        const { data, error } = await supabaseAdmin
          .from("profiles")
          .select("id, full_name, phone, role, profile_photo_url")
          .eq("id", supplier.owner_id)
          .single();
        
        if (error) {
          // If profile_photo_url column doesn't exist, fetch without it
          if (error.code === '42703') {
            const { data: profileData } = await supabaseAdmin
              .from("profiles")
              .select("id, full_name, phone, role")
              .eq("id", supplier.owner_id)
              .single();
            profile = profileData;
          } else {
            console.error(`Failed to fetch profile for supplier ${supplier.owner_id}:`, error);
          }
        } else {
          profile = data;
        }
        
        // Fetch email from Supabase Auth
        let email = null;
        try {
          const { data: authData } = await supabaseAdmin.auth.admin.getUserById(supplier.owner_id);
          email = authData?.user?.email || null;
        } catch (e) {
          console.error(`Failed to fetch email for supplier ${supplier.owner_id}:`, e);
        }
        
        return {
          ...supplier,
          profiles: profile ? { ...profile, email } : null,
        };
      })
    );

    res.json(suppliersWithProfiles);
  } catch (error: any) {
    console.error("Error fetching suppliers:", error);
    res.status(500).json({ error: error.message });
  }
});

// Get all drivers
router.get("/drivers", async (req, res) => {
  try {
    const { data: drivers, error } = await supabaseAdmin
      .from("drivers")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) throw error;

    // Fetch profiles, emails, and vehicles for drivers
    const driversWithProfiles = await Promise.all(
      (drivers || []).map(async (driver) => {
        // Try to fetch profile with profile_photo_url, fallback to without if column doesn't exist
        let profile = null;
        const { data, error } = await supabaseAdmin
          .from("profiles")
          .select("id, full_name, phone, role, profile_photo_url")
          .eq("id", driver.user_id)
          .single();
        
        if (error) {
          // If profile_photo_url column doesn't exist, fetch without it
          if (error.code === '42703') {
            const { data: profileData } = await supabaseAdmin
              .from("profiles")
              .select("id, full_name, phone, role")
              .eq("id", driver.user_id)
              .single();
            profile = profileData;
          } else {
            console.error(`Failed to fetch profile for driver ${driver.user_id}:`, error);
          }
        } else {
          profile = data;
        }
        
        // Fetch email from Supabase Auth
        let email = null;
        try {
          const { data: authData } = await supabaseAdmin.auth.admin.getUserById(driver.user_id);
          email = authData?.user?.email || null;
        } catch (e) {
          console.error(`Failed to fetch email for driver ${driver.user_id}:`, e);
        }
        
        // Try to fetch vehicles (table may not exist yet)
        let vehicles: any[] = [];
        const { data: vehiclesData, error: vehiclesError } = await supabaseAdmin
          .from("vehicles")
          .select("id, registration_number, make, model, capacity_litres, fuel_types")
          .eq("driver_id", driver.id);
        
        if (!vehiclesError && vehiclesData) {
          vehicles = vehiclesData;
        }
        
        return {
          ...driver,
          profiles: profile ? { ...profile, email } : null,
          vehicles,
        };
      })
    );

    res.json(driversWithProfiles);
  } catch (error: any) {
    console.error("Error fetching drivers:", error);
    res.status(500).json({ error: error.message });
  }
});

// Get pending KYC/KYB applications
router.get("/kyc/pending", async (req, res) => {
  try {
    // Fetch pending drivers
    const { data: pendingDrivers, error: driversError } = await supabaseAdmin
      .from("drivers")
      .select("*")
      .eq("kyc_status", "pending");

    if (driversError) throw driversError;

    // Fetch pending suppliers
    const { data: pendingSuppliers, error: suppliersError } = await supabaseAdmin
      .from("suppliers")
      .select("*")
      .eq("kyb_status", "pending");

    if (suppliersError) throw suppliersError;

    // Fetch profiles for drivers
    const driversWithProfiles = await Promise.all(
      (pendingDrivers || []).map(async (driver) => {
        const { data: profile } = await supabaseAdmin
          .from("profiles")
          .select("id, full_name, phone")
          .eq("id", driver.user_id)
          .single();
        
        return {
          ...driver,
          profiles: profile,
        };
      })
    );

    // Fetch profiles for suppliers
    const suppliersWithProfiles = await Promise.all(
      (pendingSuppliers || []).map(async (supplier) => {
        const { data: profile } = await supabaseAdmin
          .from("profiles")
          .select("id, full_name, phone")
          .eq("id", supplier.owner_id)
          .single();
        
        return {
          ...supplier,
          profiles: profile,
        };
      })
    );

    res.json({
      drivers: driversWithProfiles,
      suppliers: suppliersWithProfiles,
    });
  } catch (error: any) {
    console.error("Error fetching pending KYC:", error);
    res.status(500).json({ error: error.message });
  }
});

// Approve driver KYC
router.post("/kyc/driver/:id/approve", async (req, res) => {
  try {
    const { id } = req.params;
    const user = (req as any).user;

    // Get driver user_id before updating
    const { data: driver } = await supabaseAdmin
      .from("drivers")
      .select("user_id")
      .eq("id", id)
      .single();

    console.log(`[KYC Approval] Updating driver ${id} with status: active, compliance_status: approved`);
    
    const { data: updatedDriver, error } = await supabaseAdmin
      .from("drivers")
      .update({ 
        kyc_status: "approved",
        status: "active",
        compliance_status: "approved",
        compliance_reviewer_id: user.id,
        compliance_review_date: new Date().toISOString(),
        compliance_rejection_reason: null,
        updated_at: new Date().toISOString() 
      })
      .eq("id", id)
      .select("id, user_id, status, compliance_status, kyc_status")
      .single();

    if (error) {
      console.error(`[KYC Approval] Error updating driver ${id}:`, error);
      throw error;
    }
    
    console.log(`[KYC Approval] Driver ${id} updated successfully:`, updatedDriver);
    
    // Also update the profile's is_active field so admin portal shows correct status
    if (updatedDriver?.user_id) {
      const { error: profileError } = await supabaseAdmin
        .from("profiles")
        .update({ 
          is_active: true,
          approval_status: "approved"
        })
        .eq("id", updatedDriver.user_id);
      
      if (profileError) {
        console.error(`[KYC Approval] Error updating profile for user ${updatedDriver.user_id}:`, profileError);
        // Don't throw - driver update succeeded, profile update is secondary
      } else {
        console.log(`[KYC Approval] Profile ${updatedDriver.user_id} updated successfully: is_active=true, approval_status=approved`);
      }
    }

    // Broadcast KYC approval to all admins and the driver
    const { websocketService } = await import("./websocket");
    websocketService.broadcastToRole("admin", {
      type: "kyc_approved",
      payload: {
        driverId: id,
        userId: driver?.user_id,
        type: "driver",
      },
    });

    if (driver?.user_id) {
      websocketService.sendToUser(driver.user_id, {
        type: "kyc_approved",
        payload: {
          driverId: id,
          type: "driver",
        },
      });

      // Send notification to driver
      const { notificationService } = await import("./notification-service");
      await notificationService.notifyAdminKycApproved(driver.user_id, "driver");
    }

    res.json({ success: true, message: "Driver KYC approved" });
  } catch (error: any) {
    console.error("Error approving driver KYC:", error);
    res.status(500).json({ error: error.message });
  }
});

// Reject driver KYC
router.post("/kyc/driver/:id/reject", async (req, res) => {
  try {
    const { id } = req.params;

    // Get driver user_id before updating
    const { data: driver } = await supabaseAdmin
      .from("drivers")
      .select("user_id")
      .eq("id", id)
      .single();

    const { error } = await supabaseAdmin
      .from("drivers")
      .update({ 
        kyc_status: "rejected",
        status: "rejected",
        compliance_status: "rejected",
        updated_at: new Date().toISOString() 
      })
      .eq("id", id);

    if (error) throw error;
    
    // Also update the profile's is_active field
    if (driver?.user_id) {
      await supabaseAdmin
        .from("profiles")
        .update({ 
          is_active: false,
          approval_status: "rejected"
        })
        .eq("id", driver.user_id);
    }

    // Broadcast KYC rejection to all admins and the driver
    const { websocketService } = await import("./websocket");
    websocketService.broadcastToRole("admin", {
      type: "kyc_rejected",
      payload: {
        driverId: id,
        userId: driver?.user_id,
        type: "driver",
      },
    });

    if (driver?.user_id) {
      websocketService.sendToUser(driver.user_id, {
        type: "kyc_rejected",
        payload: {
          driverId: id,
          type: "driver",
        },
      });

      // Send notification to driver
      const { notificationService } = await import("./notification-service");
      const { reason } = req.body;
      await notificationService.notifyAdminKycRejected(driver.user_id, "driver", reason);
    }

    res.json({ success: true, message: "Driver KYC rejected" });
  } catch (error: any) {
    console.error("Error rejecting driver KYC:", error);
    res.status(500).json({ error: error.message });
  }
});

// Approve supplier KYB
router.post("/kyc/supplier/:id/approve", async (req, res) => {
  try {
    const { id } = req.params;
    const user = (req as any).user;

    // Get supplier owner_id before updating
    const { data: supplier } = await supabaseAdmin
      .from("suppliers")
      .select("owner_id")
      .eq("id", id)
      .single();

    console.log(`[KYC Approval] Updating supplier ${id} with status: active, compliance_status: approved`);
    
    const { data: updatedSupplier, error } = await supabaseAdmin
      .from("suppliers")
      .update({ 
        kyb_status: "approved",
        status: "active",
        compliance_status: "approved",
        compliance_reviewer_id: user.id,
        compliance_review_date: new Date().toISOString(),
        compliance_rejection_reason: null,
        updated_at: new Date().toISOString() 
      })
      .eq("id", id)
      .select("id, owner_id, status, compliance_status, kyb_status")
      .single();

    if (error) {
      console.error(`[KYC Approval] Error updating supplier ${id}:`, error);
      throw error;
    }
    
    console.log(`[KYC Approval] Supplier ${id} updated successfully:`, updatedSupplier);
    
    // Also update the profile's is_active field so admin portal shows correct status
    if (updatedSupplier?.owner_id) {
      console.log(`[KYC Approval] Updating profile ${updatedSupplier.owner_id} for supplier ${id}`);
      const { data: updatedProfile, error: profileError } = await supabaseAdmin
        .from("profiles")
        .update({ 
          is_active: true,
          approval_status: "approved"
        })
        .eq("id", updatedSupplier.owner_id)
        .select("id, is_active, approval_status")
        .single();

      if (profileError) {
        console.error(`[KYC Approval] Error updating profile for supplier ${id}:`, profileError);
        // Don't throw - log but continue
      } else {
        console.log(`[KYC Approval] Profile ${updatedSupplier.owner_id} updated successfully:`, {
          is_active: updatedProfile?.is_active,
          approval_status: updatedProfile?.approval_status
        });
      }
    } else {
      console.warn(`[KYC Approval] No owner_id found for supplier ${id}, cannot update profile`);
    }

    // Broadcast KYB approval to all admins and the supplier
    const { websocketService } = await import("./websocket");
    websocketService.broadcastToRole("admin", {
      type: "kyc_approved",
      payload: {
        supplierId: id,
        userId: supplier?.owner_id,
        type: "supplier",
      },
    });

    if (supplier?.owner_id) {
      websocketService.sendToUser(supplier.owner_id, {
        type: "kyc_approved",
        payload: {
          supplierId: id,
          type: "supplier",
        },
      });

      // Send notification to supplier
      const { notificationService } = await import("./notification-service");
      await notificationService.notifyAdminKycApproved(supplier.owner_id, "supplier");
    }

    res.json({ success: true, message: "Supplier KYB approved" });
  } catch (error: any) {
    console.error("Error approving supplier KYB:", error);
    res.status(500).json({ error: error.message });
  }
});

// Reject supplier KYB
router.post("/kyc/supplier/:id/reject", async (req, res) => {
  try {
    const { id } = req.params;

    // Get supplier owner_id before updating
    const { data: supplier } = await supabaseAdmin
      .from("suppliers")
      .select("owner_id")
      .eq("id", id)
      .single();

    const { error } = await supabaseAdmin
      .from("suppliers")
      .update({ 
        kyb_status: "rejected",
        status: "rejected",
        compliance_status: "rejected",
        updated_at: new Date().toISOString() 
      })
      .eq("id", id);

    if (error) throw error;
    
    // Also update the profile's is_active field
    if (supplier?.owner_id) {
      await supabaseAdmin
        .from("profiles")
        .update({ 
          is_active: false,
          approval_status: "rejected"
        })
        .eq("id", supplier.owner_id);
    }

    // Broadcast KYB rejection to all admins and the supplier
    const { websocketService } = await import("./websocket");
    websocketService.broadcastToRole("admin", {
      type: "kyc_rejected",
      payload: {
        supplierId: id,
        userId: supplier?.owner_id,
        type: "supplier",
      },
    });

    if (supplier?.owner_id) {
      websocketService.sendToUser(supplier.owner_id, {
        type: "kyc_rejected",
        payload: {
          supplierId: id,
          type: "supplier",
        },
      });

      // Send notification to supplier
      const { notificationService } = await import("./notification-service");
      const { reason } = req.body;
      await notificationService.notifyAdminKycRejected(supplier.owner_id, "supplier", reason);
    }

    res.json({ success: true, message: "Supplier KYB rejected" });
  } catch (error: any) {
    console.error("Error rejecting supplier KYB:", error);
    res.status(500).json({ error: error.message });
  }
});

// Reset user password
router.post("/users/:id/reset-password", async (req, res) => {
  try {
    const { id } = req.params;
    const { password } = req.body;

    if (!password || password.length < 6) {
      return res.status(400).json({ error: "Password must be at least 6 characters" });
    }

    const { error } = await supabaseAdmin.auth.admin.updateUserById(id, {
      password: password,
    });

    if (error) throw error;

    res.json({ success: true, message: "Password reset successfully" });
  } catch (error: any) {
    console.error("Error resetting password:", error);
    res.status(500).json({ error: error.message });
  }
});

// Update user profile
router.patch("/users/:id/profile", async (req, res) => {
  try {
    const { id } = req.params;
    const { full_name, phone, role } = req.body;

    const updateData: any = {
      updated_at: new Date().toISOString(),
    };

    if (full_name) updateData.full_name = full_name;
    if (phone) updateData.phone = phone;
    if (role) updateData.role = role;

    const { error } = await supabaseAdmin
      .from("profiles")
      .update(updateData)
      .eq("id", id);

    if (error) throw error;

    res.json({ success: true, message: "Profile updated successfully" });
  } catch (error: any) {
    console.error("Error updating profile:", error);
    res.status(500).json({ error: error.message });
  }
});

// Create new user
router.post("/users/create", async (req, res) => {
  let userId: string | null = null;
  
  try {
    const { email, password, role, full_name, phone, additionalData } = req.body;

    // Validate required fields
    if (!email || !password || !role || !full_name) {
      return res.status(400).json({ error: "Email, password, role, and full name are required" });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: "Password must be at least 6 characters" });
    }

    if (!["customer", "driver", "supplier", "admin"].includes(role)) {
      return res.status(400).json({ error: "Invalid role" });
    }

    // Validate role-specific required fields
    if (role === "supplier" && !additionalData?.companyName) {
      return res.status(400).json({ error: "Company name is required for suppliers" });
    }

    // 1. Create user in Supabase Auth
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        full_name,
      },
    });

    if (authError) throw authError;
    if (!authData.user) throw new Error("Failed to create user");

    userId = authData.user.id;

    // 2. Create profile
    const { error: profileError } = await supabaseAdmin.from("profiles").insert({
      id: userId,
      role,
      full_name,
      phone: phone || null,
    });

    if (profileError) {
      // Rollback: delete auth user if profile creation fails
      await supabaseAdmin.auth.admin.deleteUser(userId);
      throw profileError;
    }

    // 3. Create role-specific record
    try {
      if (role === "customer") {
        const { error } = await supabaseAdmin.from("customers").insert({
          user_id: userId,
          company_name: additionalData?.companyName || null,
          vat_number: additionalData?.vatNumber || null,
        });
        if (error) throw error;
      } else if (role === "driver") {
        const { error } = await supabaseAdmin.from("drivers").insert({
          user_id: userId,
          kyc_status: "pending",
          vehicle_registration: additionalData?.vehicleRegistration || null,
          vehicle_capacity_litres: additionalData?.vehicleCapacityLitres || null,
          company_name: additionalData?.companyName || null,
        });
        if (error) throw error;
      } else if (role === "supplier") {
        const { error } = await supabaseAdmin.from("suppliers").insert({
          owner_id: userId,
          name: additionalData.companyName, // Required - already validated above
          kyb_status: "pending",
          cipc_number: additionalData?.cipcNumber || null,
        });
        if (error) throw error;
      }
    } catch (roleError: any) {
      // Rollback: delete profile and auth user if role-specific insert fails
      await supabaseAdmin.from("profiles").delete().eq("id", userId);
      await supabaseAdmin.auth.admin.deleteUser(userId);
      throw new Error(`Failed to create ${role} record: ${roleError.message}`);
    }

    // Broadcast user creation to all admins via WebSocket
    const { websocketService } = await import("./websocket");
    websocketService.broadcastToRole("admin", {
      type: "user_created",
      payload: {
        userId,
        role,
        fullName,
        email,
      },
    });

    // If driver or supplier created, also broadcast KYC submission
    if (role === "driver" || role === "supplier") {
      websocketService.broadcastToRole("admin", {
        type: "kyc_submitted",
        payload: {
          userId,
          role,
        },
      });
    }

    res.json({
      success: true,
      message: `${role.charAt(0).toUpperCase() + role.slice(1)} account created successfully`,
      userId,
    });
  } catch (error: any) {
    console.error("Error creating user:", error);
    res.status(500).json({ error: error.message });
  }
});

// Get user details by ID
router.get("/users/:userId", async (req, res) => {
  try {
    const { userId } = req.params;

    // Fetch profile
    const { data: profile, error: profileError } = await supabaseAdmin
      .from("profiles")
      .select("*")
      .eq("id", userId)
      .single();

    if (profileError) throw profileError;

    // Fetch email from Supabase Auth
    const { data: authData } = await supabaseAdmin.auth.admin.getUserById(userId);
    const email = authData?.user?.email || null;

    const result: any = { profile: { ...profile, email } };

    // Fetch role-specific data
    if (profile.role === "customer") {
      const { data: customer } = await supabaseAdmin
        .from("customers")
        .select("*")
        .eq("user_id", userId)
        .single();
      result.customer = customer;
    } else if (profile.role === "driver") {
      const { data: driver } = await supabaseAdmin
        .from("drivers")
        .select("*")
        .eq("user_id", userId)
        .single();
      
      // Fetch driver's vehicles
      const { data: vehicles } = await supabaseAdmin
        .from("vehicles")
        .select("*")
        .eq("driver_id", driver?.id)
        .order("created_at", { ascending: false });
      
      result.driver = driver;
      result.vehicles = vehicles || [];
      
      // Include address from driver table (compliance fields) or profile as fallback
      if (driver) {
        if (driver.address_line_1 || driver.city) {
          result.address = {
            address_line_1: driver.address_line_1,
            address_line_2: driver.address_line_2,
            city: driver.city,
            province: driver.province,
            postal_code: driver.postal_code,
            country: driver.country || "South Africa",
          };
        } else if (profile.address_street || profile.address_city) {
          result.address = {
            address_street: profile.address_street,
            address_line_2: profile.address_line_2,
            address_city: profile.address_city,
            address_province: profile.address_province,
            address_postal_code: profile.address_postal_code,
            country: profile.country || "South Africa",
          };
        }
      }
    } else if (profile.role === "supplier") {
      // Use maybeSingle to handle cases where supplier record doesn't exist yet
      const { data: supplier, error: supplierError } = await supabaseAdmin
        .from("suppliers")
        .select("*")
        .eq("owner_id", userId)
        .maybeSingle();
      
      if (supplierError && supplierError.code !== 'PGRST116') {
        // PGRST116 is "not found" which is fine, but other errors should be logged
        console.error("Error fetching supplier:", supplierError);
      }
      
      result.supplier = supplier || null;
    }

    res.json(result);
  } catch (error: any) {
    console.error("Error fetching user details:", error);
    res.status(500).json({ error: error.message });
  }
});

// Update user details
router.patch("/users/:userId", async (req, res) => {
  try {
    const { userId } = req.params;
    const { 
      full_name, 
      phone, 
      phone_country_code,
      email,
      role, 
      address_street,
      address_city,
      address_province,
      address_postal_code,
      approval_status,
      is_active,
      notes,
      ...roleData 
    } = req.body;

    // Update email if provided
    if (email !== undefined) {
      await supabaseAdmin.auth.admin.updateUserById(userId, { email });
    }

    // Update profile with all new fields
    const profileUpdate: any = {};
    if (full_name !== undefined) profileUpdate.full_name = full_name;
    if (phone !== undefined) profileUpdate.phone = phone || null;
    if (phone_country_code !== undefined) profileUpdate.phone_country_code = phone_country_code;
    if (role !== undefined) profileUpdate.role = role;
    if (address_street !== undefined) profileUpdate.address_street = address_street;
    if (address_city !== undefined) profileUpdate.address_city = address_city;
    if (address_province !== undefined) profileUpdate.address_province = address_province;
    if (address_postal_code !== undefined) profileUpdate.address_postal_code = address_postal_code;
    if (approval_status !== undefined) profileUpdate.approval_status = approval_status;
    if (is_active !== undefined) profileUpdate.is_active = is_active;
    if (notes !== undefined) profileUpdate.notes = notes;

    if (Object.keys(profileUpdate).length > 0) {
      const { error: profileError } = await supabaseAdmin
        .from("profiles")
        .update(profileUpdate)
        .eq("id", userId);

      if (profileError) throw profileError;
    }

    // Update customer-specific data
    if (role === "customer") {
      const customerUpdate: any = {};
      if (roleData.za_id_number !== undefined) customerUpdate.za_id_number = roleData.za_id_number;
      if (roleData.dob !== undefined) customerUpdate.dob = roleData.dob;
      if (roleData.company_name !== undefined) customerUpdate.company_name = roleData.company_name;
      if (roleData.trading_as !== undefined) customerUpdate.trading_as = roleData.trading_as;
      if (roleData.vat_number !== undefined) customerUpdate.vat_number = roleData.vat_number;
      if (roleData.sars_tax_number !== undefined) customerUpdate.sars_tax_number = roleData.sars_tax_number;
      if (roleData.billing_address_street !== undefined) customerUpdate.billing_address_street = roleData.billing_address_street;
      if (roleData.billing_address_city !== undefined) customerUpdate.billing_address_city = roleData.billing_address_city;
      if (roleData.risk_tier !== undefined) customerUpdate.risk_tier = roleData.risk_tier;
      if (roleData.verification_level !== undefined) customerUpdate.verification_level = roleData.verification_level;

      if (Object.keys(customerUpdate).length > 0) {
        const { error } = await supabaseAdmin
          .from("customers")
          .update(customerUpdate)
          .eq("user_id", userId);
        if (error) throw error;
      }
    }
    
    // Update driver-specific data
    else if (role === "driver") {
      const driverUpdate: any = {};
      if (roleData.za_id_number !== undefined) driverUpdate.za_id_number = roleData.za_id_number;
      if (roleData.passport_number !== undefined) driverUpdate.passport_number = roleData.passport_number;
      if (roleData.dob !== undefined) driverUpdate.dob = roleData.dob;
      if (roleData.drivers_license_number !== undefined) driverUpdate.drivers_license_number = roleData.drivers_license_number;
      if (roleData.prdp_number !== undefined) driverUpdate.prdp_number = roleData.prdp_number;
      if (roleData.bank_account_name !== undefined) driverUpdate.bank_account_name = roleData.bank_account_name;
      if (roleData.bank_name !== undefined) driverUpdate.bank_name = roleData.bank_name;
      if (roleData.account_number !== undefined) driverUpdate.account_number = roleData.account_number;
      if (roleData.branch_code !== undefined) driverUpdate.branch_code = roleData.branch_code;
      if (roleData.next_of_kin_name !== undefined) driverUpdate.next_of_kin_name = roleData.next_of_kin_name;
      if (roleData.next_of_kin_phone !== undefined) driverUpdate.next_of_kin_phone = roleData.next_of_kin_phone;
      if (roleData.availability_status !== undefined) driverUpdate.availability_status = roleData.availability_status;

      if (Object.keys(driverUpdate).length > 0) {
        const { error } = await supabaseAdmin
          .from("drivers")
          .update(driverUpdate)
          .eq("user_id", userId);
        if (error) throw error;
      }
    }
    
    // Update supplier-specific data
    else if (role === "supplier") {
      const supplierUpdate: any = {};
      if (roleData.registered_name !== undefined) supplierUpdate.registered_name = roleData.registered_name;
      if (roleData.trading_as !== undefined) supplierUpdate.trading_as = roleData.trading_as;
      if (roleData.vat_number !== undefined) supplierUpdate.vat_number = roleData.vat_number;
      if (roleData.bbbee_level !== undefined) supplierUpdate.bbbee_level = roleData.bbbee_level;
      if (roleData.dmre_license_number !== undefined) supplierUpdate.dmre_license_number = roleData.dmre_license_number;
      if (roleData.primary_contact_name !== undefined) supplierUpdate.primary_contact_name = roleData.primary_contact_name;
      if (roleData.primary_contact_phone !== undefined) supplierUpdate.primary_contact_phone = roleData.primary_contact_phone;

      if (Object.keys(supplierUpdate).length > 0) {
        const { error } = await supabaseAdmin
          .from("suppliers")
          .update(supplierUpdate)
          .eq("owner_id", userId);
        if (error) throw error;
      }
    }

    res.json({ success: true, message: "User updated successfully" });
  } catch (error: any) {
    console.error("Error updating user:", error);
    res.status(500).json({ error: error.message });
  }
});

// Get driver vehicles
router.get("/drivers/:driverId/vehicles", async (req, res) => {
  try {
    const { driverId } = req.params;
    
    const { data: vehicles, error } = await supabaseAdmin
      .from("vehicles")
      .select("*")
      .eq("driver_id", driverId);
    
    if (error) throw error;
    res.json(vehicles || []);
  } catch (error: any) {
    console.error("Error fetching vehicles:", error);
    res.status(500).json({ error: error.message });
  }
});

// Add vehicle for driver
router.post("/drivers/:driverId/vehicles", async (req, res) => {
  try {
    const { driverId } = req.params;
    const vehicleData = req.body;
    
    const { data, error } = await supabaseAdmin
      .from("vehicles")
      .insert({
        driver_id: driverId,
        ...vehicleData
      })
      .select()
      .single();
    
    if (error) throw error;
    res.json(data);
  } catch (error: any) {
    console.error("Error adding vehicle:", error);
    res.status(500).json({ error: error.message });
  }
});

// Update vehicle
router.patch("/vehicles/:vehicleId", async (req, res) => {
  try {
    const { vehicleId } = req.params;
    const vehicleData = req.body;
    
    const { data, error } = await supabaseAdmin
      .from("vehicles")
      .update(vehicleData)
      .eq("id", vehicleId)
      .select()
      .single();
    
    if (error) throw error;
    res.json(data);
  } catch (error: any) {
    console.error("Error updating vehicle:", error);
    res.status(500).json({ error: error.message });
  }
});

// Delete vehicle
router.delete("/vehicles/:vehicleId", async (req, res) => {
  try {
    const { vehicleId } = req.params;
    
    const { error } = await supabaseAdmin
      .from("vehicles")
      .delete()
      .eq("id", vehicleId);
    
    if (error) throw error;
    res.json({ success: true });
  } catch (error: any) {
    console.error("Error deleting vehicle:", error);
    res.status(500).json({ error: error.message });
  }
});

// Approve vehicle
router.post("/vehicles/:vehicleId/approve", async (req, res) => {
  try {
    const { vehicleId } = req.params;
    const user = (req as any).user;

    // Get vehicle to verify it exists
    const { data: vehicle, error: vehicleError } = await supabaseAdmin
      .from("vehicles")
      .select("id, driver_id")
      .eq("id", vehicleId)
      .single();

    if (vehicleError) throw vehicleError;
    if (!vehicle) {
      return res.status(404).json({ error: "Vehicle not found" });
    }

    console.log(`[Vehicle Approval] Updating vehicle ${vehicleId} with status: active`);
    
    const { data: updatedVehicle, error } = await supabaseAdmin
      .from("vehicles")
      .update({ 
        vehicle_status: "active",
        updated_at: new Date().toISOString() 
      })
      .eq("id", vehicleId)
      .select("id, vehicle_status")
      .single();

    if (error) {
      console.error(`[Vehicle Approval] Error updating vehicle ${vehicleId}:`, error);
      throw error;
    }
    
    console.log(`[Vehicle Approval] Vehicle ${vehicleId} updated successfully:`, updatedVehicle);

    // Broadcast vehicle approval to all admins and the driver
    const { websocketService } = await import("./websocket");
    websocketService.broadcastToRole("admin", {
      type: "vehicle_approved",
      payload: {
        vehicleId: vehicleId,
        driverId: vehicle.driver_id,
      },
    });

    // Get driver's user_id to send notification
    const { data: driver } = await supabaseAdmin
      .from("drivers")
      .select("user_id")
      .eq("id", vehicle.driver_id)
      .single();

    if (driver?.user_id) {
      websocketService.sendToUser(driver.user_id, {
        type: "vehicle_approved",
        payload: {
          vehicleId: vehicleId,
        },
      });

      // Send notification to driver
      const { notificationService } = await import("./notification-service");
      const registrationNumber = vehicle.registration_number || "Vehicle";
      await notificationService.notifyAdminVehicleApproved(
        driver.user_id,
        vehicleId,
        registrationNumber
      );
    }

    res.json({ success: true, message: "Vehicle approved successfully", vehicle: updatedVehicle });
  } catch (error: any) {
    console.error("Error approving vehicle:", error);
    res.status(500).json({ error: error.message });
  }
});

// Reject vehicle
router.post("/vehicles/:vehicleId/reject", async (req, res) => {
  try {
    const { vehicleId } = req.params;
    const { rejectionReason } = req.body;

    // Get vehicle to verify it exists
    const { data: vehicle, error: vehicleError } = await supabaseAdmin
      .from("vehicles")
      .select("id, driver_id")
      .eq("id", vehicleId)
      .single();

    if (vehicleError) throw vehicleError;
    if (!vehicle) {
      return res.status(404).json({ error: "Vehicle not found" });
    }

    console.log(`[Vehicle Rejection] Updating vehicle ${vehicleId} with status: rejected`);
    
    const { data: updatedVehicle, error } = await supabaseAdmin
      .from("vehicles")
      .update({ 
        vehicle_status: "rejected",
        updated_at: new Date().toISOString() 
      })
      .eq("id", vehicleId)
      .select("id, vehicle_status")
      .single();

    if (error) {
      console.error(`[Vehicle Rejection] Error updating vehicle ${vehicleId}:`, error);
      throw error;
    }

    // Broadcast vehicle rejection to all admins and the driver
    const { websocketService } = await import("./websocket");
    websocketService.broadcastToRole("admin", {
      type: "vehicle_rejected",
      payload: {
        vehicleId: vehicleId,
        driverId: vehicle.driver_id,
        rejectionReason,
      },
    });

    // Get driver's user_id to send notification
    const { data: driver } = await supabaseAdmin
      .from("drivers")
      .select("user_id")
      .eq("id", vehicle.driver_id)
      .single();

    if (driver?.user_id) {
      websocketService.sendToUser(driver.user_id, {
        type: "vehicle_rejected",
        payload: {
          vehicleId: vehicleId,
          rejectionReason,
        },
      });

      // Send notification to driver
      const { notificationService } = await import("./notification-service");
      const { data: vehicleData } = await supabaseAdmin
        .from("vehicles")
        .select("registration_number")
        .eq("id", vehicleId)
        .single();
      const registrationNumber = vehicleData?.registration_number || "Vehicle";
      await notificationService.notifyAdminVehicleRejected(
        driver.user_id,
        vehicleId,
        registrationNumber,
        rejectionReason
      );
    }

    res.json({ success: true, message: "Vehicle rejected", vehicle: updatedVehicle });
  } catch (error: any) {
    console.error("Error rejecting vehicle:", error);
    res.status(500).json({ error: error.message });
  }
});

// Get user documents
router.get("/users/:userId/documents", async (req, res) => {
  try {
    const { userId } = req.params;
    
    console.log(`[GET /api/admin/users/${userId}/documents] Fetching documents for user:`, userId);
    
    // First, get the profile to determine the role
    const { data: profile, error: profileError } = await supabaseAdmin
      .from("profiles")
      .select("role")
      .eq("id", userId)
      .single();
    
    if (profileError) {
      console.error("Error fetching profile:", profileError);
      return res.json([]);
    }
    
    if (!profile) {
      console.log("No profile found for user:", userId);
      return res.json([]);
    }
    
    console.log("Profile role:", profile.role);
    
    let ownerId = userId;
    let ownerType = profile.role;
    
    // For drivers, we need to get the driver record ID, not the user ID
    if (profile.role === "driver") {
      const { data: driver, error: driverError } = await supabaseAdmin
        .from("drivers")
        .select("id, user_id")
        .eq("user_id", userId)
        .maybeSingle();
      
      if (driverError) {
        console.error("Error fetching driver:", driverError);
      }
      
      if (driver) {
        ownerId = driver.id;
        ownerType = "driver";
        console.log("Found driver record - driver.id:", driver.id, "user_id:", driver.user_id, "Using ownerId:", ownerId);
      } else {
        console.log("No driver record found for user:", userId);
        // Still try to fetch documents with user_id as owner_id in case they were stored incorrectly
        ownerId = userId;
        ownerType = "driver";
        console.log("Using userId as ownerId fallback:", ownerId);
      }
    } else if (profile.role === "supplier") {
      const { data: supplier, error: supplierError } = await supabaseAdmin
        .from("suppliers")
        .select("id")
        .eq("owner_id", userId)
        .maybeSingle();
      
      if (supplierError) {
        console.error("Error fetching supplier:", supplierError);
      }
      
      if (supplier) {
        ownerId = supplier.id;
        ownerType = "supplier";
        console.log("Found supplier record - supplier.id:", supplier.id, "owner_id:", userId, "Using ownerId:", ownerId);
      } else {
        console.log("No supplier record found for user:", userId);
        // Still try to fetch documents with user_id as owner_id in case they were stored incorrectly
        ownerId = userId;
        ownerType = "supplier";
        console.log("Using userId as ownerId fallback:", ownerId);
      }
    }
    
    console.log("Fetching documents with ownerId:", ownerId, "ownerType:", ownerType);
    
    // Validate ownerId is a valid UUID before querying
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!ownerId || !uuidRegex.test(ownerId)) {
      console.warn("Invalid or empty ownerId:", ownerId, "Skipping document query");
      return res.json([]);
    }
    
    // Also fetch vehicle documents if driver
    let vehicleDocuments: any[] = [];
    if (profile.role === "driver" && ownerType === "driver") {
      const { data: vehicles } = await supabaseAdmin
        .from("vehicles")
        .select("id")
        .eq("driver_id", ownerId);
      
      if (vehicles && vehicles.length > 0) {
        const vehicleIds = vehicles.map(v => v.id).filter(id => id && uuidRegex.test(id));
        if (vehicleIds.length > 0) {
          const { data: vDocs } = await supabaseAdmin
            .from("documents")
            .select("*")
            .in("owner_id", vehicleIds)
            .eq("owner_type", "vehicle")
            .order("created_at", { ascending: false });
          
          vehicleDocuments = vDocs || [];
          console.log("Found", vehicleDocuments.length, "vehicle documents");
        }
      }
    }
    
    // First, let's check what documents actually exist in the database for debugging
    const { data: allDriverDocs, error: debugError } = await supabaseAdmin
      .from("documents")
      .select("*")
      .eq("owner_type", "driver")
      .order("created_at", { ascending: false });
    
    console.log(`[DEBUG] Total documents with owner_type='driver' in database:`, allDriverDocs?.length || 0);
    if (allDriverDocs && allDriverDocs.length > 0) {
      console.log(`[DEBUG] Sample document owner_ids:`, allDriverDocs.slice(0, 5).map((d: any) => ({ 
        owner_id: d.owner_id, 
        owner_type: d.owner_type, 
        doc_type: d.doc_type,
        title: d.title 
      })));
    }
    
    // Fetch documents for the owner
    let { data, error } = await supabaseAdmin
      .from("documents")
      .select("*")
      .eq("owner_id", ownerId)
      .eq("owner_type", ownerType)
      .order("created_at", { ascending: false });
    
    if (error) {
      console.error("Error fetching documents:", error);
      throw error;
    }
    
    console.log("Found", data?.length || 0, "documents for owner (ownerId:", ownerId, "ownerType:", ownerType, ")");
    
    // If no documents found, try multiple fallback queries for drivers and suppliers
    if (!data || data.length === 0) {
      if (profile.role === "driver") {
        console.log("No documents found with driver.id, trying fallback queries...");
        
        // Try 1: Query by user_id (validate UUID first)
        if (userId && uuidRegex.test(userId)) {
          const { data: fallbackData1, error: fallbackError1 } = await supabaseAdmin
            .from("documents")
            .select("*")
            .eq("owner_id", userId)
            .eq("owner_type", "driver")
            .order("created_at", { ascending: false });
        
          if (!fallbackError1 && fallbackData1 && fallbackData1.length > 0) {
            console.log("Found", fallbackData1.length, "documents using fallback query (user_id)");
            data = fallbackData1;
          } else {
            // Try 2: Query all driver documents and filter by uploaded_by (validate UUID first)
            if (userId && uuidRegex.test(userId)) {
              const { data: fallbackData2, error: fallbackError2 } = await supabaseAdmin
                .from("documents")
                .select("*")
                .eq("owner_type", "driver")
                .eq("uploaded_by", userId)
                .order("created_at", { ascending: false });
              
              if (!fallbackError2 && fallbackData2 && fallbackData2.length > 0) {
                console.log("Found", fallbackData2.length, "documents using fallback query (uploaded_by)");
                data = fallbackData2;
              }
            }
          }
        }
      } else if (profile.role === "supplier") {
        console.log("No documents found with supplier.id, trying fallback queries...");
        
        // Try 1: Query by user_id (owner_id) - validate UUID first
        if (userId && uuidRegex.test(userId)) {
          const { data: fallbackData1, error: fallbackError1 } = await supabaseAdmin
            .from("documents")
            .select("*")
            .eq("owner_id", userId)
            .eq("owner_type", "supplier")
            .order("created_at", { ascending: false });
        
          if (!fallbackError1 && fallbackData1 && fallbackData1.length > 0) {
            console.log("Found", fallbackData1.length, "supplier documents using fallback query (user_id/owner_id)");
            data = fallbackData1;
          } else {
            // Try 2: Query all supplier documents and filter by uploaded_by (validate UUID first)
            if (userId && uuidRegex.test(userId)) {
              const { data: fallbackData2, error: fallbackError2 } = await supabaseAdmin
                .from("documents")
                .select("*")
                .eq("owner_type", "supplier")
                .eq("uploaded_by", userId)
                .order("created_at", { ascending: false });
              
              if (!fallbackError2 && fallbackData2 && fallbackData2.length > 0) {
                console.log("Found", fallbackData2.length, "supplier documents using fallback query (uploaded_by)");
                data = fallbackData2;
              }
            }
          }
        }
      }
    }
    
    // Combine driver documents with vehicle documents
    const allDocuments = [...(data || []), ...vehicleDocuments];
    
    // Filter out documents with empty or invalid file_path
    const validDocuments = allDocuments.filter((doc: any) => {
      if (!doc.file_path || doc.file_path.trim() === '') {
        console.warn("Filtering out document with empty file_path:", doc.id, doc.title);
        return false;
      }
      return true;
    });
    
    console.log("Total documents to return:", validDocuments.length, "(filtered", allDocuments.length - validDocuments.length, "with empty file_path)");
    
    res.json(validDocuments);
  } catch (error: any) {
    console.error("Error fetching documents:", error);
    res.status(500).json({ error: error.message });
  }
});

// Create document
router.post("/users/:userId/documents", async (req, res) => {
  try {
    const { userId } = req.params;
    const { owner_type, doc_type, title, file_path, file_size, mime_type } = req.body;
    
    const { data, error } = await supabaseAdmin
      .from("documents")
      .insert({
        owner_type,
        owner_id: userId,
        doc_type,
        title,
        file_path,
        file_size,
        mime_type,
      })
      .select()
      .single();
    
    if (error) throw error;
    res.json(data);
  } catch (error: any) {
    console.error("Error creating document:", error);
    res.status(500).json({ error: error.message });
  }
});

// Update document status (used by frontend) - MUST BE BEFORE DELETE ROUTE
router.patch("/documents/:documentId/status", async (req, res) => {
  try {
    const { documentId } = req.params;
    const { status, rejectionReason } = req.body;
    const user = (req as any).user;

    console.log(`[PATCH /api/admin/documents/${documentId}/status] Request received`, {
      documentId,
      status,
      hasRejectionReason: !!rejectionReason,
      userId: user?.id
    });

    if (!status) {
      return res.status(400).json({ error: "Status is required" });
    }

    // Map frontend status to backend status
    let verificationStatus: string;
    if (status === "approved") {
      verificationStatus = "approved"; // Use "approved" instead of "verified" to match frontend
    } else if (status === "rejected") {
      verificationStatus = "rejected";
    } else if (status === "pending" || status === "pending_review") {
      verificationStatus = "pending";
    } else {
      verificationStatus = status;
    }

    const updateData: any = {
      verification_status: verificationStatus,
      verified_by: user.id,
      verified_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    if (status === "rejected" && rejectionReason) {
      updateData.document_rejection_reason = rejectionReason;
    } else if (status === "approved") {
      updateData.document_rejection_reason = null;
    }

    const { data: updatedDocument, error: updateError } = await supabaseAdmin
      .from("documents")
      .update(updateData)
      .eq("id", documentId)
      .select()
      .single();

    if (updateError) throw updateError;

    console.log("Document status updated:", { documentId, status: verificationStatus });

    // Send WebSocket notification to driver or supplier if document belongs to them
    if (updatedDocument?.owner_type === "driver") {
      // Get driver's user_id
      const { data: driver } = await supabaseAdmin
        .from("drivers")
        .select("user_id")
        .eq("id", updatedDocument.owner_id)
        .single();

      if (driver?.user_id) {
        websocketService.sendToUser(driver.user_id, {
          type: verificationStatus === "approved" ? "document_approved" : "document_rejected",
          payload: {
            documentId: documentId,
            status: verificationStatus,
          },
        });
      }
    } else if (updatedDocument?.owner_type === "supplier") {
      // Get supplier's owner_id (which is the user_id)
      const { data: supplier } = await supabaseAdmin
        .from("suppliers")
        .select("owner_id")
        .eq("id", updatedDocument.owner_id)
        .single();

      if (supplier?.owner_id) {
        websocketService.sendToUser(supplier.owner_id, {
          type: verificationStatus === "approved" ? "document_approved" : "document_rejected",
          payload: {
            documentId: documentId,
            status: verificationStatus,
          },
        });
      }
    }

    res.json({ success: true, document: updatedDocument });
  } catch (error: any) {
    console.error("Error updating document status:", error);
    res.status(500).json({ error: error.message });
  }
});

// Delete document
router.delete("/documents/:documentId", async (req, res) => {
  try {
    const { documentId } = req.params;
    
    const { error } = await supabaseAdmin
      .from("documents")
      .delete()
      .eq("id", documentId);
    
    if (error) throw error;
    res.json({ success: true });
  } catch (error: any) {
    console.error("Error deleting document:", error);
    res.status(500).json({ error: error.message });
  }
});

// Set profile picture for a user (admin endpoint)
router.put("/users/:userId/profile-picture", async (req, res) => {
  try {
    const { userId } = req.params;
    const { profilePictureURL } = req.body;

    if (!profilePictureURL) {
      return res.status(400).json({ error: "profilePictureURL is required" });
    }

    // Set ACL for the profile picture with the target user as owner
    const objectPath = await objectStorageService.trySetObjectEntityAclPolicy(
      profilePictureURL,
      {
        owner: userId,
        visibility: "public", // Profile pictures are public
      }
    );

    // Update profile_photo_url in database (if column exists)
    try {
      const { error: updateError } = await supabaseAdmin
        .from("profiles")
        .update({ profile_photo_url: objectPath })
        .eq("id", userId);

      if (updateError) {
        console.error(`Failed to update profile_photo_url for user ${userId}:`, updateError);
        // Don't fail the request if column doesn't exist yet
      }
    } catch (e) {
      console.error(`Database update failed (profile_photo_url column may not exist):`, e);
      // Continue - ACL was set successfully
    }

    res.json({ objectPath });
  } catch (error: any) {
    console.error("Error setting profile picture ACL:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ============== COMPLIANCE REVIEW ROUTES ==============

// Get all pending compliance reviews
router.get("/compliance/pending", async (req, res) => {
  try {
    // Get drivers pending compliance
    const { data: pendingDrivers, error: driversError } = await supabaseAdmin
      .from("drivers")
      .select("id, user_id, status, compliance_status")
      .in("status", ["pending_compliance"])
      .in("compliance_status", ["pending", "incomplete"]);

    if (driversError) {
      console.error("Error fetching pending drivers:", driversError);
    }

    // Get suppliers pending compliance
    const { data: pendingSuppliers, error: suppliersError } = await supabaseAdmin
      .from("suppliers")
      .select("id, owner_id, status, compliance_status, name, registered_name")
      .in("status", ["pending_compliance"])
      .in("compliance_status", ["pending", "incomplete"]);

    if (suppliersError) {
      console.error("Error fetching pending suppliers:", suppliersError);
    }

    // Fetch profiles for drivers separately
    const driversWithProfiles = await Promise.all(
      (pendingDrivers || []).map(async (driver) => {
        const { data: profile } = await supabaseAdmin
          .from("profiles")
          .select("id, full_name, email, phone")
          .eq("id", driver.user_id)
          .maybeSingle();
        
        return {
          ...driver,
          profiles: profile || null,
        };
      })
    );

    // Fetch profiles for suppliers separately
    const suppliersWithProfiles = await Promise.all(
      (pendingSuppliers || []).map(async (supplier) => {
        const { data: profile } = await supabaseAdmin
          .from("profiles")
          .select("id, full_name, email, phone")
          .eq("id", supplier.owner_id)
          .maybeSingle();
        
        return {
          ...supplier,
          profiles: profile || null,
        };
      })
    );

    res.json({
      drivers: driversWithProfiles,
      suppliers: suppliersWithProfiles,
    });
  } catch (error: any) {
    console.error("Error getting pending compliance:", error);
    res.status(500).json({ error: error.message });
  }
});

// Get driver compliance checklist
router.get("/compliance/driver/:id/checklist", async (req, res) => {
  try {
    const { id } = req.params;
    const complianceStatus = await getDriverComplianceStatus(id);
    res.json(complianceStatus);
  } catch (error: any) {
    console.error("Error getting driver compliance checklist:", error);
    res.status(500).json({ error: error.message });
  }
});

// Get supplier compliance checklist
router.get("/compliance/supplier/:id/checklist", async (req, res) => {
  try {
    const { id } = req.params;
    const complianceStatus = await getSupplierComplianceStatus(id);
    res.json(complianceStatus);
  } catch (error: any) {
    console.error("Error getting supplier compliance checklist:", error);
    res.status(500).json({ error: error.message });
  }
});

// Approve driver compliance
router.post("/compliance/driver/:id/approve", async (req, res) => {
  try {
    const { id } = req.params;
    const user = (req as any).user;

    const { error: updateError } = await supabaseAdmin
      .from("drivers")
      .update({
        compliance_status: "approved",
        status: "active",
        compliance_reviewer_id: user.id,
        compliance_review_date: new Date().toISOString(),
        compliance_rejection_reason: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id);

    if (updateError) throw updateError;

    // Get driver user_id for notification
    const { data: driver } = await supabaseAdmin
      .from("drivers")
      .select("user_id")
      .eq("id", id)
      .single();

    // Broadcast to admins
    websocketService.broadcastToRole("admin", {
      type: "compliance_approved",
      payload: {
        driverId: id,
        userId: driver?.user_id,
        type: "driver",
        reviewerId: user.id,
      },
    });

    // Notify driver
    if (driver?.user_id) {
      websocketService.sendToUser(driver.user_id, {
        type: "compliance_approved",
        payload: {
          driverId: id,
          type: "driver",
        },
      });
    }

    res.json({ success: true, message: "Driver compliance approved" });
  } catch (error: any) {
    console.error("Error approving driver compliance:", error);
    res.status(500).json({ error: error.message });
  }
});

// Reject driver compliance
router.post("/compliance/driver/:id/reject", async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;
    const user = (req as any).user;

    if (!reason) {
      return res.status(400).json({ error: "Rejection reason is required" });
    }

    const { error: updateError } = await supabaseAdmin
      .from("drivers")
      .update({
        compliance_status: "rejected",
        status: "rejected",
        compliance_reviewer_id: user.id,
        compliance_review_date: new Date().toISOString(),
        compliance_rejection_reason: reason,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id);

    if (updateError) throw updateError;

    // Get driver user_id for notification
    const { data: driver } = await supabaseAdmin
      .from("drivers")
      .select("user_id")
      .eq("id", id)
      .single();

    // Broadcast to admins
    websocketService.broadcastToRole("admin", {
      type: "compliance_rejected",
      payload: {
        driverId: id,
        userId: driver?.user_id,
        type: "driver",
        reviewerId: user.id,
        reason,
      },
    });

    // Notify driver
    if (driver?.user_id) {
      websocketService.sendToUser(driver.user_id, {
        type: "compliance_rejected",
        payload: {
          driverId: id,
          type: "driver",
          reason,
        },
      });
    }

    res.json({ success: true, message: "Driver compliance rejected" });
  } catch (error: any) {
    console.error("Error rejecting driver compliance:", error);
    res.status(500).json({ error: error.message });
  }
});

// Approve supplier compliance
router.post("/compliance/supplier/:id/approve", async (req, res) => {
  try {
    const { id } = req.params;
    const user = (req as any).user;

    const { error: updateError } = await supabaseAdmin
      .from("suppliers")
      .update({
        compliance_status: "approved",
        status: "active",
        compliance_reviewer_id: user.id,
        compliance_review_date: new Date().toISOString(),
        compliance_rejection_reason: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id);

    if (updateError) throw updateError;

    // Get supplier owner_id for notification
    const { data: supplier } = await supabaseAdmin
      .from("suppliers")
      .select("owner_id")
      .eq("id", id)
      .single();

    // Broadcast to admins
    websocketService.broadcastToRole("admin", {
      type: "compliance_approved",
      payload: {
        supplierId: id,
        userId: supplier?.owner_id,
        type: "supplier",
        reviewerId: user.id,
      },
    });

    // Notify supplier
    if (supplier?.owner_id) {
      websocketService.sendToUser(supplier.owner_id, {
        type: "compliance_approved",
        payload: {
          supplierId: id,
          type: "supplier",
        },
      });
    }

    res.json({ success: true, message: "Supplier compliance approved" });
  } catch (error: any) {
    console.error("Error approving supplier compliance:", error);
    res.status(500).json({ error: error.message });
  }
});

// Reject supplier compliance
router.post("/compliance/supplier/:id/reject", async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;
    const user = (req as any).user;

    if (!reason) {
      return res.status(400).json({ error: "Rejection reason is required" });
    }

    const { error: updateError } = await supabaseAdmin
      .from("suppliers")
      .update({
        compliance_status: "rejected",
        status: "rejected",
        compliance_reviewer_id: user.id,
        compliance_review_date: new Date().toISOString(),
        compliance_rejection_reason: reason,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id);

    if (updateError) throw updateError;

    // Get supplier owner_id for notification
    const { data: supplier } = await supabaseAdmin
      .from("suppliers")
      .select("owner_id")
      .eq("id", id)
      .single();

    // Broadcast to admins
    websocketService.broadcastToRole("admin", {
      type: "compliance_rejected",
      payload: {
        supplierId: id,
        userId: supplier?.owner_id,
        type: "supplier",
        reviewerId: user.id,
        reason,
      },
    });

    // Notify supplier
    if (supplier?.owner_id) {
      websocketService.sendToUser(supplier.owner_id, {
        type: "compliance_rejected",
        payload: {
          supplierId: id,
          type: "supplier",
          reason,
        },
      });
    }

    res.json({ success: true, message: "Supplier compliance rejected" });
  } catch (error: any) {
    console.error("Error rejecting supplier compliance:", error);
    res.status(500).json({ error: error.message });
  }
});

// Approve individual document
router.post("/compliance/documents/:id/approve", async (req, res) => {
  try {
    const { id } = req.params;
    const user = (req as any).user;

    // Get document details before updating
    const { data: document, error: docError } = await supabaseAdmin
      .from("documents")
      .select("owner_type, owner_id, doc_type, uploaded_by")
      .eq("id", id)
      .single();

    if (docError) throw docError;

    const { error: updateError } = await supabaseAdmin
      .from("documents")
      .update({
        verification_status: "approved",
        verified_by: user.id,
        verified_at: new Date().toISOString(),
        document_rejection_reason: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id);

    if (updateError) throw updateError;

    // Send notification to document owner
    if (document) {
      let userId: string | null = null;
      
      // Get user_id based on owner_type
      if (document.owner_type === "driver") {
        const { data: driver } = await supabaseAdmin
          .from("drivers")
          .select("user_id")
          .eq("id", document.owner_id)
          .single();
        userId = driver?.user_id || null;
      } else if (document.owner_type === "supplier") {
        const { data: supplier } = await supabaseAdmin
          .from("suppliers")
          .select("owner_id")
          .eq("id", document.owner_id)
          .single();
        userId = supplier?.owner_id || null;
      } else if (document.owner_type === "customer") {
        const { data: customer } = await supabaseAdmin
          .from("customers")
          .select("user_id")
          .eq("id", document.owner_id)
          .single();
        userId = customer?.user_id || null;
      } else if (document.owner_type === "vehicle") {
        // For vehicle documents, get the driver's user_id
        const { data: vehicle } = await supabaseAdmin
          .from("vehicles")
          .select("driver_id, drivers!inner(user_id)")
          .eq("id", document.owner_id)
          .single();
        userId = vehicle?.drivers?.user_id || null;
      }

      if (userId) {
        const { notificationService } = await import("./notification-service");
        await notificationService.notifyAdminDocumentApproved(
          userId,
          id,
          document.doc_type || "document"
        );
      }
    }

    res.json({ success: true, message: "Document approved" });
  } catch (error: any) {
    console.error("Error approving document:", error);
    res.status(500).json({ error: error.message });
  }
});

// Reject individual document
router.post("/compliance/documents/:id/reject", async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;
    const user = (req as any).user;

    if (!reason) {
      return res.status(400).json({ error: "Rejection reason is required" });
    }

    const { error: updateError } = await supabaseAdmin
      .from("documents")
      .update({
        verification_status: "rejected",
        verified_by: user.id,
        verified_at: new Date().toISOString(),
        document_rejection_reason: reason,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id);

    if (updateError) throw updateError;

    res.json({ success: true, message: "Document rejected" });
  } catch (error: any) {
    console.error("Error rejecting document:", error);
    res.status(500).json({ error: error.message });
  }
});

// ============== APP SETTINGS ROUTES ==============

// Get app settings
router.get("/settings", async (req, res) => {
  try {
    const { data: settings, error } = await supabaseAdmin
      .from("app_settings")
      .select("*")
      .eq("id", 1)
      .single();

    if (error) {
      // If settings don't exist, return defaults
      if (error.code === "PGRST116") {
        return res.json({
          id: 1,
          service_fee_percent: "5",
          service_fee_min_cents: 10000,
          base_delivery_fee_cents: 35000,
          price_per_km_cents: 5000,
          dispatch_radius_km: "50",
          dispatch_sla_seconds: 120,
        });
      }
      throw error;
    }

    res.json(settings);
  } catch (error: any) {
    console.error("Error fetching app settings:", error);
    res.status(500).json({ error: error.message });
  }
});

// Update app settings
router.put("/settings", async (req, res) => {
  try {
    const { price_per_km_cents, service_fee_percent, service_fee_min_cents, base_delivery_fee_cents, dispatch_radius_km, dispatch_sla_seconds } = req.body;

    const updateData: any = {
      updated_at: new Date().toISOString(),
    };

    if (price_per_km_cents !== undefined) {
      if (price_per_km_cents < 0) {
        return res.status(400).json({ error: "Price per km must be positive" });
      }
      updateData.price_per_km_cents = price_per_km_cents;
    }

    if (service_fee_percent !== undefined) {
      updateData.service_fee_percent = service_fee_percent;
    }

    if (service_fee_min_cents !== undefined) {
      updateData.service_fee_min_cents = service_fee_min_cents;
    }

    if (base_delivery_fee_cents !== undefined) {
      updateData.base_delivery_fee_cents = base_delivery_fee_cents;
    }

    if (dispatch_radius_km !== undefined) {
      updateData.dispatch_radius_km = dispatch_radius_km;
    }

    if (dispatch_sla_seconds !== undefined) {
      updateData.dispatch_sla_seconds = dispatch_sla_seconds;
    }

    const { data: updatedSettings, error } = await supabaseAdmin
      .from("app_settings")
      .upsert({
        id: 1,
        ...updateData,
      }, {
        onConflict: "id"
      })
      .select()
      .single();

    if (error) throw error;

    res.json({ success: true, settings: updatedSettings });
  } catch (error: any) {
    console.error("Error updating app settings:", error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
