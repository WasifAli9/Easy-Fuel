import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function fixSchema() {
  console.log("Adding currency column to profiles table...");
  
  // Add currency column if it doesn't exist
  const { data: currencyResult, error: currencyError } = await supabase.rpc('exec_sql', {
    sql: `
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns 
          WHERE table_name = 'profiles' AND column_name = 'currency'
        ) THEN
          ALTER TABLE profiles ADD COLUMN currency varchar(3) DEFAULT 'ZAR' NOT NULL;
          RAISE NOTICE 'Added currency column to profiles table';
        ELSE
          RAISE NOTICE 'Currency column already exists';
        END IF;
      END $$;
    `
  });

  if (currencyError) {
    console.error("Error adding currency column:", currencyError.message);
  } else {
    console.log("Currency column added successfully");
  }

  // Reload PostgREST schema cache
  console.log("Reloading PostgREST schema cache...");
  const { error: reloadError } = await supabase.rpc('exec_sql', {
    sql: "NOTIFY pgrst, 'reload schema';"
  });

  if (reloadError) {
    console.error("Error reloading schema:", reloadError.message);
  } else {
    console.log("Schema cache reloaded successfully");
  }
}

fixSchema()
  .then(() => {
    console.log("Schema fix complete!");
    process.exit(0);
  })
  .catch((err) => {
    console.error("Failed to fix schema:", err);
    process.exit(1);
  });
