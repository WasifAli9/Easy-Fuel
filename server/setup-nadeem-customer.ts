import { supabaseAdmin } from "./supabase";

async function setupCustomer() {
  const userId = "cf7035b7-0184-4fab-b9b7-8cd8e8178c3e";
  const email = "nadeem.mohammed@deffinity.com";
  
  console.log(`\n🛠️  Setting up customer profile for ${email}\n`);
  
  // Create profile
  const { error: profileError } = await supabaseAdmin.from("profiles").upsert({
    id: userId,
    role: "customer",
    full_name: "Nadeem Mohammed",
    phone: "+27 81 234 5678",
    updated_at: new Date().toISOString(),
  }, {
    onConflict: 'id'
  });

  if (profileError) {
    console.error(`❌ Failed to create profile: ${profileError.message}`);
    process.exit(1);
  }
  console.log(`✅ Profile created (Role: Customer)`);

  // Create customer record
  const { data: existing } = await supabaseAdmin
    .from("customers")
    .select("id")
    .eq("user_id", userId)
    .single();

  const { error: customerError } = await supabaseAdmin.from("customers").upsert({
    id: existing?.id,
    user_id: userId,
    company_name: "Deffinity",
    vat_number: "",
    updated_at: new Date().toISOString(),
  });
  
  if (customerError) {
    console.error(`❌ Failed to create customer record: ${customerError.message}`);
  } else {
    console.log(`✅ Customer record created`);
  }

  console.log(`\n✨ Setup complete!`);
  console.log(`\n📧 Email: ${email}`);
  console.log(`👤 Role: Customer`);
  console.log(`🏢 Company: Deffinity`);
  console.log(`\n🔐 Sign in options:`);
  console.log(`   1. Password tab - Set password in Supabase Dashboard first`);
  console.log(`   2. Magic Link tab - Works with .com domain\n`);
}

setupCustomer();
