import { supabase } from "./supabase";

/**
 * Check if Supabase connection is working
 * Run this script to test connectivity: tsx server/check-supabase-connection.ts
 */
async function checkSupabaseConnection() {
  console.log("🔍 Checking Supabase connection...\n");

  try {
    // Test 1: Check if we can reach Supabase
    console.log("Test 1: Attempting to connect to Supabase...");
    const { error: sessionError } = await supabase.auth.getSession();
    
    if (sessionError) {
      console.error("❌ Session check failed:", sessionError.message);
    } else {
      console.log("✅ Can reach Supabase API");
    }

    // Test 2: Try to query a table (profiles is likely to exist)
    console.log("\nTest 2: Testing database connection...");
    const { error: dbError } = await supabase
      .from("profiles")
      .select("count")
      .limit(0);

    if (dbError) {
      if (dbError.message.includes("does not exist")) {
        console.log("✅ Database connection working (profiles table needs to be created)");
      } else {
        console.error("❌ Database error:", dbError.message);
      }
    } else {
      console.log("✅ Database connection working");
    }

    console.log("\n✅ Supabase connection is healthy!");
    console.log("\nSupabase URL:", process.env.SUPABASE_URL || "https://piejkqvpkxnrnudztrmt.supabase.co");
    
  } catch (error: any) {
    console.error("\n❌ Connection test failed!");
    
    if (error.code === 'ENOTFOUND') {
      console.error("\n🚨 DNS Resolution Error - Cannot find Supabase host");
      console.error("   Hostname:", error.hostname);
      console.error("\n   Possible causes:");
      console.error("   1. ⏸️  Supabase project is PAUSED (free tier projects pause after inactivity)");
      console.error("       → Solution: Visit https://supabase.com/dashboard");
      console.error("       → Click on your project to wake it up");
      console.error("       → Wait 1-2 minutes for it to resume");
      console.error("\n   2. 🌐 Network/DNS issues");
      console.error("       → Check your internet connection");
      console.error("       → Try: ping piejkqvpkxnrnudztrmt.supabase.co");
      console.error("       → Try: nslookup piejkqvpkxnrnudztrmt.supabase.co");
      console.error("\n   3. 🔥 Firewall blocking Supabase");
      console.error("       → Check firewall settings");
      console.error("       → Allow outbound connections to *.supabase.co");
      console.error("\n   4. ❌ Invalid Supabase URL");
      console.error("       → Verify SUPABASE_URL in environment variables");
      console.error("       → Check Supabase Dashboard for correct URL");
    } else if (error.code === 'ETIMEDOUT' || error.message?.includes('timeout')) {
      console.error("\n⏱️  Connection Timeout");
      console.error("   Your server cannot reach Supabase within the timeout period");
      console.error("   → Check network connection");
      console.error("   → Supabase may be experiencing issues - check status.supabase.com");
    } else {
      console.error("\n❓ Unexpected error:", error.message || error);
      console.error("   Error code:", error.code);
      console.error("   Error type:", error.constructor.name);
    }
    
    process.exit(1);
  }
}

checkSupabaseConnection();

