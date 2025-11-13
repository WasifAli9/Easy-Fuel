import "dotenv/config";
import pg from "pg";

const { Client } = pg;

async function ensureDeliverySignatureColumns() {
  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    console.error("DATABASE_URL environment variable is not set.");
    process.exit(1);
  }

  const client = new Client({ connectionString });

  try {
    await client.connect();
    console.log("Connected to database");

    await client.query(`
      ALTER TABLE orders
      ADD COLUMN IF NOT EXISTS delivery_signature_data TEXT
    `);
    await client.query(`
      ALTER TABLE orders
      ADD COLUMN IF NOT EXISTS delivery_signature_name TEXT
    `);
    await client.query(`
      ALTER TABLE orders
      ADD COLUMN IF NOT EXISTS delivery_signed_at TIMESTAMP
    `);

    await client.query(`NOTIFY pgrst, 'reload schema'`);
    console.log("Ensured delivery signature columns and triggered schema reload");
  } catch (error) {
    console.error("Error ensuring delivery signature columns:", error);
    process.exit(1);
  } finally {
    await client.end();
  }
}

ensureDeliverySignatureColumns();

