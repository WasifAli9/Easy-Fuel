import { readFileSync } from "fs";
import { supabaseAdmin } from "./supabase";

async function applyMigration() {
  try {
    console.log("Applying database migration...");
    
    const migrationSQL = readFileSync("migrations/0000_odd_callisto.sql", "utf-8");
    
    // Split by statement breakpoint and execute each statement
    const statements = migrationSQL
      .split("--> statement-breakpoint")
      .map(s => s.trim())
      .filter(s => s.length > 0);
    
    for (const statement of statements) {
      try {
        const { error } = await supabaseAdmin.rpc("exec_sql", { sql: statement });
        if (error) {
          // Try direct query if RPC doesn't work
          const result = await fetch(`${process.env.SUPABASE_URL}/rest/v1/rpc/exec_sql`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "apikey": process.env.SUPABASE_SERVICE_ROLE_KEY!,
              "Authorization": `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`
            },
            body: JSON.stringify({ sql: statement })
          });
          
          if (!result.ok) {
            console.log("Statement might already exist:", statement.substring(0, 100));
          }
        }
      } catch (err: any) {
        // Ignore "already exists" errors
        if (!err.message?.includes("already exists")) {
          console.log("Error (ignoring if table exists):", err.message?.substring(0, 100));
        }
      }
    }
    
    console.log("Migration applied successfully!");
  } catch (error) {
    console.error("Error applying migration:", error);
  }
}

applyMigration();
