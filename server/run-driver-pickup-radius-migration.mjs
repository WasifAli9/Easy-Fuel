import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import pg from "pg";
import dotenv from "dotenv";

dotenv.config();

const __dirname = dirname(fileURLToPath(import.meta.url));
const sql = readFileSync(join(__dirname, "add-driver-pickup-radius-column.sql"), "utf8");

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error("DATABASE_URL is not set.");
  process.exit(1);
}

const pool = new pg.Pool({ connectionString });

try {
  await pool.query(sql);
  const { rows } = await pool.query(
    "SELECT driver_pickup_radius_miles FROM app_settings WHERE id = 1",
  );
  console.log("Migration applied. Current value:", rows[0]?.driver_pickup_radius_miles);
} catch (err) {
  console.error("Migration failed:", err.message);
  process.exitCode = 1;
} finally {
  await pool.end();
}
