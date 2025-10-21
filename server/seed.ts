import { supabaseAdmin } from "./supabase";

const TEST_ACCOUNTS = [
  {
    email: "customer@easyfuel.ai",
    role: "customer" as const,
    fullName: "Test Customer",
    phone: "+27 81 123 4567",
    additionalData: {
      companyName: "Acme Industries",
      vatNumber: "4123456789",
    },
  },
  {
    email: "driver@easyfuel.ai",
    role: "driver" as const,
    fullName: "John Driver",
    phone: "+27 82 234 5678",
    additionalData: {
      vehicleRegistration: "ABC 123 GP",
      vehicleCapacityLitres: 5000,
      companyName: "Quick Delivery Transport",
    },
  },
  {
    email: "supplier@easyfuel.ai",
    role: "supplier" as const,
    fullName: "Sarah Supplier",
    phone: "+27 83 345 6789",
    additionalData: {
      companyName: "Premium Fuel Suppliers Ltd",
      cipcNumber: "2023/123456/07",
    },
  },
  {
    email: "admin@easyfuel.ai",
    role: "admin" as const,
    fullName: "Admin User",
    phone: "+27 84 456 7890",
    additionalData: {},
  },
];

async function seedTestAccounts() {
  console.log("\n🧪 Creating test accounts...\n");

  for (const account of TEST_ACCOUNTS) {
    try {
      console.log(`Processing ${account.role}: ${account.email}`);

      // 1. Get or create user in Supabase Auth
      let userId: string | null = null;
      
      // Try to create user - if already exists, we'll fetch the ID
      const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
        email: account.email,
        email_confirm: true,
        user_metadata: {
          full_name: account.fullName,
        },
      });

      if (authError) {
        // If user already exists, fetch their ID
        if (authError.message.includes("already") || authError.message.includes("duplicate")) {
          // Fetch all users and find by email (handling pagination)
          let page = 1;
          let found = false;
          
          while (!found && page <= 10) { // Limit to 10 pages for safety
            const { data } = await supabaseAdmin.auth.admin.listUsers({ page, perPage: 100 });
            const user = data?.users.find(u => u.email === account.email);
            
            if (user) {
              userId = user.id;
              console.log(`  ♻️  User already exists: ${userId}`);
              found = true;
            } else if (!data?.users || data.users.length === 0) {
              break; // No more pages
            }
            page++;
          }
          
          if (!userId) {
            console.error(`  ❌ User exists but couldn't fetch ID`);
            continue;
          }
        } else {
          console.error(`  ❌ Failed to create auth user: ${authError.message}`);
          continue;
        }
      } else {
        userId = authData.user.id;
        console.log(`  ✅ Auth user created: ${userId}`);
      }

      if (!userId) {
        console.error(`  ❌ Failed to get user ID`);
        continue;
      }

      // 2. Upsert profile (create or update if exists)
      const { error: profileError } = await supabaseAdmin.from("profiles").upsert({
        id: userId,
        role: account.role,
        full_name: account.fullName,
        phone: account.phone,
        updated_at: new Date().toISOString(),
      }, {
        onConflict: 'id'
      });

      if (profileError) {
        console.error(`  ❌ Failed to upsert profile: ${profileError.message}`);
        continue;
      }
      console.log(`  ✅ Profile ready`);

      // 3. Upsert role-specific record (handles create and update)
      if (account.role === "customer") {
        // First check if customer exists to get the ID for upsert
        const { data: existing } = await supabaseAdmin
          .from("customers")
          .select("id")
          .eq("user_id", userId)
          .single();

        const { error } = await supabaseAdmin.from("customers").upsert({
          id: existing?.id, // Include ID if exists for update
          user_id: userId,
          company_name: account.additionalData.companyName,
          vat_number: account.additionalData.vatNumber,
          updated_at: new Date().toISOString(),
        });
        
        if (error) console.error(`  ❌ Failed to upsert customer: ${error.message}`);
        else console.log(`  ✅ Customer record ready`);
        
      } else if (account.role === "driver") {
        const { data: existing } = await supabaseAdmin
          .from("drivers")
          .select("id")
          .eq("user_id", userId)
          .single();

        const { error } = await supabaseAdmin.from("drivers").upsert({
          id: existing?.id,
          user_id: userId,
          kyc_status: "approved",
          vehicle_registration: account.additionalData.vehicleRegistration,
          vehicle_capacity_litres: account.additionalData.vehicleCapacityLitres,
          company_name: account.additionalData.companyName,
          updated_at: new Date().toISOString(),
        });
        
        if (error) console.error(`  ❌ Failed to upsert driver: ${error.message}`);
        else console.log(`  ✅ Driver record ready`);
        
      } else if (account.role === "supplier") {
        const { data: existing } = await supabaseAdmin
          .from("suppliers")
          .select("id")
          .eq("owner_id", userId)
          .single();

        const { error } = await supabaseAdmin.from("suppliers").upsert({
          id: existing?.id,
          owner_id: userId,
          name: account.additionalData.companyName,
          kyb_status: "approved",
          cipc_number: account.additionalData.cipcNumber,
          updated_at: new Date().toISOString(),
        });
        
        if (error) console.error(`  ❌ Failed to upsert supplier: ${error.message}`);
        else console.log(`  ✅ Supplier record ready`);
      }

      console.log(`  ✨ ${account.role.toUpperCase()} complete\n`);
    } catch (error: any) {
      console.error(`  ❌ Error creating ${account.email}:`, error.message, "\n");
    }
  }
}

async function seed() {
  try {
    console.log("🌱 Seeding database...");

    // Insert default app settings
    const { error: settingsError } = await supabaseAdmin
      .from("app_settings")
      .upsert({
        id: 1,
        service_fee_percent: "5",
        service_fee_min_cents: 10000, // R100
        base_delivery_fee_cents: 35000, // R350
        dispatch_radius_km: "50",
        dispatch_sla_seconds: 120,
      });

    if (settingsError) {
      console.log("Settings already exist or error:", settingsError.message);
    }

    // Insert default fuel types (all available at typical African gas stations)
    const defaultFuelTypes = [
      { code: "diesel", label: "Diesel", active: true },
      { code: "diesel_500ppm", label: "Diesel 500ppm", active: true },
      { code: "diesel_50ppm", label: "Diesel 50ppm (Ultra Low Sulphur)", active: true },
      { code: "petrol_93", label: "Petrol 93 (Unleaded)", active: true },
      { code: "petrol_95", label: "Petrol 95 (Unleaded)", active: true },
      { code: "petrol_97", label: "Petrol 97 (Premium Unleaded)", active: true },
      { code: "lpg", label: "LPG (Liquefied Petroleum Gas)", active: true },
      { code: "adblue", label: "AdBlue (Diesel Exhaust Fluid)", active: true },
      { code: "paraffin", label: "Illuminating Paraffin", active: true },
      { code: "jet_a1", label: "Jet A1 (Aviation Fuel)", active: false }, // Available but not commonly used
    ];

    for (const fuel of defaultFuelTypes) {
      const { error } = await supabaseAdmin
        .from("fuel_types")
        .upsert(fuel, { onConflict: "code" });
      
      if (error && !error.message.includes("duplicate")) {
        console.log(`Error inserting ${fuel.code}:`, error.message);
      }
    }

    console.log("✅ Default data seeded successfully!");

    // Seed test accounts
    await seedTestAccounts();

    console.log("\n" + "=".repeat(60));
    console.log("✨ SEEDING COMPLETE!");
    console.log("=".repeat(60));
    console.log("\n📧 Test Accounts Created:");
    console.log("━".repeat(60));
    TEST_ACCOUNTS.forEach((account) => {
      console.log(`  ${account.role.toUpperCase().padEnd(10)} → ${account.email}`);
    });
    console.log("━".repeat(60));
    console.log("\n🔐 Sign in using magic link (emails are auto-confirmed)");
    console.log("💡 Or set passwords in Supabase Dashboard → Authentication → Users\n");
  } catch (error) {
    console.error("Error seeding database:", error);
    throw error;
  }
}

seed();
