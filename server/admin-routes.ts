import { Router } from "express";
import { supabaseAdmin } from "./supabase";

const router = Router();

// Get all users with their profiles and role-specific data
router.get("/api/admin/users", async (req, res) => {
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

// Get pending KYC/KYB applications
router.get("/api/admin/kyc/pending", async (req, res) => {
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
router.post("/api/admin/kyc/driver/:id/approve", async (req, res) => {
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
router.post("/api/admin/kyc/driver/:id/reject", async (req, res) => {
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
router.post("/api/admin/kyc/supplier/:id/approve", async (req, res) => {
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
router.post("/api/admin/kyc/supplier/:id/reject", async (req, res) => {
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
router.post("/api/admin/users/:id/reset-password", async (req, res) => {
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
router.patch("/api/admin/users/:id/profile", async (req, res) => {
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
router.post("/api/admin/users/create", async (req, res) => {
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

export default router;
