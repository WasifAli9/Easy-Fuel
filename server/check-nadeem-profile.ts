import { supabaseAdmin } from "./supabase";

async function checkProfile() {
  const userId = "cf7035b7-0184-4fab-b9b7-8cd8e8178c3e";
  
  console.log("\n🔍 Checking profile for nadeem.mohammed@deffinity.com\n");
  
  // Check profile
  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .single();
    
  if (profile) {
    console.log("✅ Profile exists:");
    console.log(`   Role: ${profile.role}`);
    console.log(`   Name: ${profile.full_name}`);
    console.log(`   Phone: ${profile.phone || 'N/A'}`);
  } else {
    console.log("❌ No profile found - needs to complete role setup");
  }
  
  // Check if customer record exists
  if (profile?.role === "customer") {
    const { data: customer } = await supabaseAdmin
      .from("customers")
      .select("*")
      .eq("user_id", userId)
      .single();
      
    if (customer) {
      console.log("\n✅ Customer record exists:");
      console.log(`   Company: ${customer.company_name || 'N/A'}`);
      console.log(`   VAT: ${customer.vat_number || 'N/A'}`);
    } else {
      console.log("\n⚠️  Customer record missing");
    }
  }
  
  console.log("\n");
}

checkProfile();
