import { createClient } from "@supabase/supabase-js";
import pg from "pg";

const { Client } = pg;

// Use direct Postgres connection
const client = new Client({
  connectionString: process.env.DATABASE_URL,
});

async function syncSchema() {
  console.log("Connecting to Supabase database...");
  
  try {
    await client.connect();
    console.log("✓ Connected to database");
    
    // Add currency column if it doesn't exist
    console.log("Adding currency column to profiles table...");
    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns 
          WHERE table_name = 'profiles' AND column_name = 'currency'
        ) THEN
          ALTER TABLE profiles ADD COLUMN currency varchar(3) DEFAULT 'ZAR' NOT NULL;
          RAISE NOTICE 'Added currency column';
        ELSE
          RAISE NOTICE 'Currency column already exists';
        END IF;
      END $$;
    `);
    console.log("✓ Currency column verified");
    
    // Verify column exists
    const result = await client.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'profiles' AND column_name = 'currency'
    `);
    
    if (result.rows.length > 0) {
      console.log("✓ Currency column confirmed in database");
    }
    
    // Notify PostgREST to reload schema cache
    await client.query("NOTIFY pgrst, 'reload schema';");
    console.log("✓ PostgREST schema cache reload triggered");
    
    console.log("\n✅ Schema sync complete! Wait 5-10 seconds for PostgREST to reload.");
  } catch (error) {
    console.error("❌ Error syncing schema:", error.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

syncSchema();
