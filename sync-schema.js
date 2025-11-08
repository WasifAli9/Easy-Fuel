import { Pool } from "@neondatabase/serverless";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function syncSchema() {
  console.log("Adding currency column to profiles table in Supabase...");
  
  try {
    // Add currency column if it doesn't exist
    await pool.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns 
          WHERE table_name = 'profiles' AND column_name = 'currency'
        ) THEN
          ALTER TABLE profiles ADD COLUMN currency varchar(3) DEFAULT 'ZAR' NOT NULL;
          RAISE NOTICE 'Added currency column';
        END IF;
      END $$;
    `);
    
    console.log("✓ Currency column added/verified in profiles table");
    
    // Notify PostgREST to reload schema cache
    await pool.query("NOTIFY pgrst, 'reload schema';");
    console.log("✓ PostgREST schema cache reload triggered");
    
    console.log("\n✓ Schema sync complete!");
  } catch (error) {
    console.error("Error syncing schema:", error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

syncSchema();
