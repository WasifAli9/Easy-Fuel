import { pool } from "./db";

/**
 * Check if PostgreSQL connection is working
 * Run this script to test connectivity: tsx server/check-db-connection.ts
 */
async function checkDatabaseConnection() {
  console.log("Checking PostgreSQL connection...\n");

  try {
    console.log("Test 1: Attempting to connect to PostgreSQL...");
    await pool.query("select 1");
    console.log("Database connection working");
    console.log("\nPostgreSQL connection is healthy!");
    console.log("\nDATABASE_URL configured:", Boolean(process.env.DATABASE_URL));
  } catch (error: any) {
    console.error("\nConnection test failed!");

    if (error.code === "ENOTFOUND") {
      console.error("\nDNS Resolution Error - Cannot find database host");
      console.error("   Hostname:", error.hostname);
      console.error("\n   Possible causes:");
      console.error("   1. Incorrect database hostname in DATABASE_URL");
      console.error("\n   2. Network/DNS issues");
      console.error("       -> Check your internet connection");
      console.error("       -> Try: ping <your-db-host>");
      console.error("       -> Try: nslookup <your-db-host>");
      console.error("\n   3. Firewall blocking PostgreSQL");
      console.error("       -> Allow outbound to DB host:5432");
    } else if (error.code === "ETIMEDOUT" || error.message?.includes("timeout")) {
      console.error("\nConnection Timeout");
      console.error("   Your server cannot reach PostgreSQL within the timeout period");
      console.error("   -> Check network connection");
      console.error("   -> Verify database host, port, and firewall rules");
    } else {
      console.error("\nUnexpected error:", error.message || error);
      console.error("   Error code:", error.code);
      console.error("   Error type:", error.constructor.name);
    }

    process.exit(1);
  }
}

checkDatabaseConnection();
