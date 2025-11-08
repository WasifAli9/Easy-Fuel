import pg from "pg";
const { Client } = pg;

const client = new Client({ connectionString: process.env.DATABASE_URL });

async function grantPermissions() {
  try {
    await client.connect();
    console.log("✓ Connected to Supabase database");
    
    // Grant schema usage
    console.log("Granting schema usage to anon and authenticated roles...");
    await client.query(`
      GRANT USAGE ON SCHEMA public TO anon, authenticated;
    `);
    console.log("✓ Schema usage granted");
    
    // Grant SELECT on driver_pricing
    console.log("Granting SELECT on driver_pricing table...");
    await client.query(`
      GRANT SELECT ON TABLE public.driver_pricing TO anon, authenticated;
    `);
    console.log("✓ SELECT granted on driver_pricing");
    
    // Grant SELECT on pricing_history
    console.log("Granting SELECT on pricing_history table...");
    await client.query(`
      GRANT SELECT ON TABLE public.pricing_history TO anon, authenticated;
    `);
    console.log("✓ SELECT granted on pricing_history");
    
    // Set default privileges for future tables
    console.log("Setting default privileges for future tables...");
    await client.query(`
      ALTER DEFAULT PRIVILEGES IN SCHEMA public 
      GRANT SELECT ON TABLES TO anon, authenticated;
    `);
    console.log("✓ Default privileges set");
    
    // Trigger PostgREST schema reload
    console.log("Triggering PostgREST schema reload...");
    await client.query("NOTIFY pgrst, 'reload schema';");
    console.log("✓ PostgREST reload triggered");
    
    console.log("\n✅ All permissions granted successfully!");
    console.log("Wait 10-30 seconds for PostgREST to reload the schema cache.");
    
  } catch (error) {
    console.error("❌ Error granting permissions:", error.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

grantPermissions();
