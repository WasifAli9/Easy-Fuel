import pg from "pg";
const { Client } = pg;

const client = new Client({ connectionString: process.env.DATABASE_URL });

async function verifyAndReload() {
  try {
    await client.connect();
    console.log("✓ Connected to Supabase database");
    
    // Check currency column
    const currencyCheck = await client.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'profiles' AND column_name = 'currency'
    `);
    console.log("Currency column exists in DB:", currencyCheck.rows.length > 0);
    
    // Check driver_pricing table
    const pricingTableCheck = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_name = 'driver_pricing'
    `);
    console.log("driver_pricing table exists:", pricingTableCheck.rows.length > 0);
    
    // Force reload PostgREST
    await client.query("NOTIFY pgrst, 'reload schema'");
    await client.query("NOTIFY pgrst, 'reload config'");
    console.log("✓ PostgREST reload triggered");
    
  } catch (error) {
    console.error("Error:", error.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

verifyAndReload();
