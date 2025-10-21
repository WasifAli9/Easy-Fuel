import { Router } from "express";
import { supabaseAdmin } from "./supabase";
import { ObjectStorageService } from "./objectStorage";

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

    // Fetch profiles for customers
    const customersWithProfiles = await Promise.all(
      (customers || []).map(async (customer) => {
        const { data: profile } = await supabaseAdmin
          .from("profiles")
          .select("id, full_name, phone, role")
          .eq("id", customer.user_id)
          .single();
        
        return {
          ...customer,
          profiles: profile ? { ...profile, profile_photo_url: null } : null,
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
    res.json(suppliers);
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
        // Fetch profile - only select columns that exist in current DB schema
        const { data: profile, error: profileError } = await supabaseAdmin
          .from("profiles")
          .select("id, full_name, phone, role")
          .eq("id", driver.user_id)
          .single();
        
        if (profileError) {
          console.error(`Failed to fetch profile for driver ${driver.user_id}:`, profileError);
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
        try {
          const { data: vehiclesData, error: vehiclesError } = await supabaseAdmin
            .from("vehicles")
            .select("id, registration_number, make, model, capacity_litres, fuel_types")
            .eq("driver_id", driver.id);
          
          if (!vehiclesError && vehiclesData) {
            vehicles = vehiclesData;
          }
        } catch (e) {
          // Vehicles table doesn't exist yet - this is expected if schema not synced
        }
        
        return {
          ...driver,
          profiles: profile ? { ...profile, email, profile_photo_url: null } : null,
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

    const { error } = await supabaseAdmin
      .from("drivers")
      .update({ kyc_status: "approved", updated_at: new Date().toISOString() })
      .eq("id", id);

    if (error) throw error;

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

    const { error } = await supabaseAdmin
      .from("drivers")
      .update({ kyc_status: "rejected", updated_at: new Date().toISOString() })
      .eq("id", id);

    if (error) throw error;

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

    const { error } = await supabaseAdmin
      .from("suppliers")
      .update({ kyb_status: "approved", updated_at: new Date().toISOString() })
      .eq("id", id);

    if (error) throw error;

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

    const { error } = await supabaseAdmin
      .from("suppliers")
      .update({ kyb_status: "rejected", updated_at: new Date().toISOString() })
      .eq("id", id);

    if (error) throw error;

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
    } else if (profile.role === "supplier") {
      const { data: supplier } = await supabaseAdmin
        .from("suppliers")
        .select("*")
        .eq("owner_id", userId)
        .single();
      result.supplier = supplier;
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

// Get user documents
router.get("/users/:userId/documents", async (req, res) => {
  try {
    const { userId } = req.params;
    
    const { data, error } = await supabaseAdmin
      .from("documents")
      .select("*")
      .eq("owner_id", userId)
      .order("created_at", { ascending: false });
    
    if (error) throw error;
    res.json(data || []);
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

    res.json({ objectPath });
  } catch (error: any) {
    console.error("Error setting profile picture ACL:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
