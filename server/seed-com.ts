import { supabaseAdmin } from "./supabase";

const TEST_ACCOUNTS = [
  {
    email: "customer@easyfuel.com",
    role: "customer" as const,
    fullName: "Test Customer",
    phone: "+27 81 123 4567",
    additionalData: {
      companyName: "Acme Industries",
      vatNumber: "4123456789",
    },
  },
  {
    email: "driver@easyfuel.com",
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
    email: "supplier@easyfuel.com",
    role: "supplier" as const,
    fullName: "Sarah Supplier",
    phone: "+27 83 345 6789",
    additionalData: {
      companyName: "Premium Fuel Suppliers Ltd",
      cipcNumber: "2023/123456/07",
    },
  },
  {
    email: "admin@easyfuel.com",
    role: "admin" as const,
    fullName: "Admin User",
    phone: "+27 84 456 7890",
    additionalData: {},
  },
];

async function seedTestAccounts() {
  console.log("\n🧪 Creating test accounts with .com domain...\n");

  for (const account of TEST_ACCOUNTS) {
    try {
      console.log(`Processing ${account.role}: ${account.email}`);

      let userId: string | null = null;
      
      const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
        email: account.email,
        email_confirm: true,
        user_metadata: {
          full_name: account.fullName,
        },
      });

      if (authError) {
        if (authError.message.includes("already") || authError.message.includes("duplicate")) {
          let page = 1;
          let found = false;
          
          while (!found && page <= 10) {
            const { data } = await supabaseAdmin.auth.admin.listUsers({ page, perPage: 100 });
            const user = data?.users.find(u => u.email === account.email);
            
            if (user) {
              userId = user.id;
              console.log(`  ♻️  User already exists: ${userId}`);
              found = true;
            } else if (!data?.users || data.users.length === 0) {
              break;
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

      if (account.role === "customer") {
        const { data: existing } = await supabaseAdmin
          .from("customers")
          .select("id")
          .eq("user_id", userId)
          .single();

        const { error } = await supabaseAdmin.from("customers").upsert({
          id: existing?.id,
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

  console.log("\n" + "=".repeat(60));
  console.log("✨ SEEDING COMPLETE!");
  console.log("=".repeat(60));
  console.log("\n📧 Test Accounts with .com domain:");
  console.log("━".repeat(60));
  TEST_ACCOUNTS.forEach((account) => {
    console.log(`  ${account.role.toUpperCase().padEnd(10)} → ${account.email}`);
  });
  console.log("━".repeat(60));
  console.log("\n🔐 Sign in using magic link (emails are auto-confirmed)\n");
}

seedTestAccounts()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Fatal error:", error);
    process.exit(1);
  });
